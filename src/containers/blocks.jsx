import bindAll from 'lodash.bindall';
import debounce from 'lodash.debounce';
import defaultsDeep from 'lodash.defaultsdeep';
import makeToolboxXML from '../lib/make-toolbox-xml';
import PropTypes from 'prop-types';
import React from 'react';
import VMScratchBlocks from '../lib/blocks';
import VM from 'scratch-vm';

import log from '../lib/log.js';
import Prompt from './prompt.jsx';
import BlocksComponent from '../components/blocks/blocks.jsx';
import ExtensionLibrary from './extension-library.jsx';
import extensionData from '../lib/libraries/extensions/index.jsx';
import CustomProcedures from './custom-procedures.jsx';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';
import { BLOCKS_DEFAULT_SCALE, STAGE_DISPLAY_SIZES } from '../lib/layout-constants';
import DropAreaHOC from '../lib/drop-area-hoc.jsx';
import DragConstants from '../lib/drag-constants';
import defineDynamicBlock from '../lib/define-dynamic-block';
import { DEFAULT_THEME, getColorsForTheme, themeMap } from '../lib/themes';
import { injectExtensionBlockTheme, injectExtensionCategoryTheme } from '../lib/themes/blockHelpers';

import { connect } from 'react-redux';
import { updateToolbox } from '../reducers/toolbox';
import { activateColorPicker } from '../reducers/color-picker';
import { closeExtensionLibrary, openSoundRecorder, openConnectionModal } from '../reducers/modals';
import { activateCustomProcedures, deactivateCustomProcedures } from '../reducers/custom-procedures';
import { setConnectionModalExtensionId } from '../reducers/connection-modal';
import { updateMetrics } from '../reducers/workspace-metrics';
import { isTimeTravel2020 } from '../reducers/time-travel';

import {
    activateTab,
    SOUNDS_TAB_INDEX
} from '../reducers/editor-tab';

const addFunctionListener = (object, property, callback) => {
    const oldFn = object[property];
    object[property] = function (...args) {
        const result = oldFn.apply(this, args);
        callback.apply(this, result);
        return result;
    };
};

const DroppableBlocks = DropAreaHOC([
    DragConstants.BACKPACK_CODE
])(BlocksComponent);

class Blocks extends React.Component {
    constructor(props) {
        super(props);
        this.ScratchBlocks = VMScratchBlocks(props.vm, false);
        bindAll(this, [
            'attachVM',
            'detachVM',
            'getToolboxXML',
            'handleCategorySelected',
            'handleConnectionModalStart',
            'handleDrop',
            'handleStatusButtonUpdate',
            'handleOpenSoundRecorder',
            'handlePromptStart',
            'handlePromptCallback',
            'handlePromptClose',
            'handleCustomProceduresClose',
            'onScriptGlowOn',
            'onScriptGlowOff',
            'onBlockGlowOn',
            'onBlockGlowOff',
            'handleMonitorsUpdate',
            'handleExtensionAdded',
            'handleBlocksInfoUpdate',
            'onTargetsUpdate',
            'onVisualReport',
            'onWorkspaceUpdate',
            'onWorkspaceMetricsChange',
            'setBlocks',
            'setLocale'
        ]);
        this.ScratchBlocks.prompt = this.handlePromptStart;
        this.ScratchBlocks.statusButtonCallback = this.handleConnectionModalStart;
        this.ScratchBlocks.recordSoundCallback = this.handleOpenSoundRecorder;

        this.state = {
            prompt: null
        };
        this.onTargetsUpdate = debounce(this.onTargetsUpdate, 100);
        this.toolboxUpdateQueue = [];
        this.lastActiveDeviceId = null;
    }
    componentDidMount() {
        this.ScratchBlocks = VMScratchBlocks(this.props.vm, this.props.useCatBlocks);
        this.ScratchBlocks.prompt = this.handlePromptStart;
        this.ScratchBlocks.statusButtonCallback = this.handleConnectionModalStart;
        this.ScratchBlocks.recordSoundCallback = this.handleOpenSoundRecorder;

        this.ScratchBlocks.FieldColourSlider.activateEyedropper_ = this.props.onActivateColorPicker;
        this.ScratchBlocks.Procedures.externalProcedureDefCallback = this.props.onActivateCustomProcedures;
        this.ScratchBlocks.ScratchMsgs.setLocale(this.props.locale);

        const workspaceConfig = defaultsDeep({},
            Blocks.defaultOptions,
            this.props.options,
            { rtl: this.props.isRtl, toolbox: this.props.toolboxXML, colours: getColorsForTheme(this.props.theme) }
        );
        this.workspace = this.ScratchBlocks.inject(this.blocks, workspaceConfig);

        // Register buttons under new callback keys for creating variables,
        // lists, and procedures from extensions.

        const toolboxWorkspace = this.workspace.getFlyout().getWorkspace();

        const varListButtonCallback = type =>
            (() => this.ScratchBlocks.Variables.createVariable(this.workspace, null, type));
        const procButtonCallback = () => {
            this.ScratchBlocks.Procedures.createProcedureDefCallback_(this.workspace);
        };

        toolboxWorkspace.registerButtonCallback('MAKE_A_VARIABLE', varListButtonCallback(''));
        toolboxWorkspace.registerButtonCallback('MAKE_A_LIST', varListButtonCallback('list'));
        toolboxWorkspace.registerButtonCallback('MAKE_A_PROCEDURE', procButtonCallback);

        // Store the xml of the toolbox that is actually rendered.
        // This is used in componentDidUpdate instead of prevProps, because
        // the xml can change while e.g. on the costumes tab.
        this._renderedToolboxXML = this.props.toolboxXML;

        // we actually never want the workspace to enable "refresh toolbox" - this basically re-renders the
        // entire toolbox every time we reset the workspace.  We call updateToolbox as a part of
        // componentDidUpdate so the toolbox will still correctly be updated
        this.setToolboxRefreshEnabled = this.workspace.setToolboxRefreshEnabled.bind(this.workspace);
        this.workspace.setToolboxRefreshEnabled = () => {
            this.setToolboxRefreshEnabled(false);
        };

        // @todo change this when blockly supports UI events
        addFunctionListener(this.workspace, 'translate', this.onWorkspaceMetricsChange);
        addFunctionListener(this.workspace, 'zoom', this.onWorkspaceMetricsChange);

        // ── Indicador persistente de estado de conexión ─────────────────────────
        // Badge en la esquina superior-derecha del workspace que refleja el
        // estado del periférico (window.playIotPeripheral). Se actualiza vía
        // eventos PERIPHERAL_CONNECTED/DISCONNECTED + polling de respaldo.
        this._connStatusEl = document.createElement('div');
        this._connStatusEl.className = 'playcode-conn-status';
        this._connStatusEl.innerHTML = `
            <span class="playcode-conn-dot"></span>
            <span class="playcode-conn-label">Desconectado</span>
        `;
        // Insertar dentro del contenedor de bloques cuando esté disponible.
        const insertConnStatus = () => {
            if (this.blocks && !this._connStatusEl.parentNode) {
                this.blocks.appendChild(this._connStatusEl);
            }
        };
        setTimeout(insertConnStatus, 0);

        const updateConnStatus = () => {
            const peripheral = window.playIotPeripheral;
            const connected = !!(peripheral && typeof peripheral.isConnected === 'function' && peripheral.isConnected());
            const label = this._connStatusEl.querySelector('.playcode-conn-label');
            this._connStatusEl.classList.toggle('playcode-conn-on', connected);
            if (label) label.textContent = connected ? 'Conectado' : 'Desconectado';
        };
        this._updateConnStatus = updateConnStatus;
        // Refresco inicial + polling cada 2s (respaldo)
        setTimeout(updateConnStatus, 100);
        this._connStatusPoll = setInterval(updateConnStatus, 2000);

        // Overlay de papelera al arrastrar bloques (icono SVG 2D plano)
        const trashSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>`;
        this._trashOverlay = document.createElement('div');
        this._trashOverlay.className = 'playcode-trash-overlay';
        this._trashOverlay.innerHTML = `<div class="playcode-trash-overlay-inner"><span class="playcode-trash-icon">${trashSVG}</span><span class="playcode-trash-label">Soltar para eliminar</span></div>`;
        document.body.appendChild(this._trashOverlay);

        const showTrash = () => {
            if (!this._trashOverlay) return;
            this._trashOverlay.classList.add('playcode-trash-visible');
        };
        const hideTrash = () => {
            if (!this._trashOverlay) return;
            this._trashOverlay.classList.remove('playcode-trash-visible', 'playcode-trash-ready');
            if (this._trashHideTimer) { clearTimeout(this._trashHideTimer); this._trashHideTimer = null; }
        };
        this._hideTrash = hideTrash;

        // Detectar drag usando pointerdown → polling liviano → pointerup
        // Sin MutationObserver (dispara demasiado en Blockly y congela la UI)
        this._trashDragPoll = null;

        this._trashPointerDown = () => {
            // Esperar a que Blockly registre el drag (añade .blocklyDragging al SVG)
            let attempts = 0;
            const check = () => {
                if (!document.querySelector('.blocklyDragging')) {
                    if (++attempts < 10) this._trashDragPoll = setTimeout(check, 80);
                    return;
                }
                // Hay un drag activo — posicionar y mostrar overlay
                const flyout = document.querySelector('.blocklyFlyout');
                if (!flyout) return;
                const rect = flyout.getBoundingClientRect();
                this._trashOverlay.style.left   = `${rect.left}px`;
                this._trashOverlay.style.top    = `${rect.top}px`;
                this._trashOverlay.style.width  = `${rect.width}px`;
                this._trashOverlay.style.height = `${rect.height}px`;
                showTrash();
            };
            this._trashDragPoll = setTimeout(check, 80);
        };

        this._hideTrash = () => {
            if (this._trashDragPoll) { clearTimeout(this._trashDragPoll); this._trashDragPoll = null; }
            hideTrash();
        };

        // pointermove: zona de papelera (flyout) — solo activo durante drag visible
        this._trashMoveHandler = (e) => {
            if (!this._trashOverlay || !this._trashOverlay.classList.contains('playcode-trash-visible')) return;
            const flyout = document.querySelector('.blocklyFlyout');
            if (!flyout) return;
            const rect = flyout.getBoundingClientRect();
            const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                           e.clientY >= rect.top  && e.clientY <= rect.bottom;
            this._trashOverlay.classList.toggle('playcode-trash-ready', inside);
        };

        document.addEventListener('pointerdown', this._trashPointerDown);
        document.addEventListener('pointerup', this._hideTrash);
        document.addEventListener('pointermove', this._trashMoveHandler);

        // ── Conflicto DIO ─────────────────────────────────────────────────────────
        const DIO_PINS = ['2', '5', '23'];
        const DIO_OPS = ['playiot_digitalRead', 'playiot_digitalWrite', 'playiot_ledBlink'];
        let _dioGuard = false;
        // Limpiar estado stale de sesiones anteriores para que el IN block arranque en DIO2
        window._playiotUsedDIOPins = new Set();

        // Devuelve true si el bloque es "real" (no shadow, no menu interno,
        // no en flyout, no marker de inserción, no preview de drag)
        const isRealDIOBlock = (block) => {
            if (!block) return false;
            if (block.isShadow && block.isShadow()) return false;
            if ((block.type || '').includes('_menu_')) return false;
            if (block.isInFlyout) return false;
            if (block.isInsertionMarker && block.isInsertionMarker()) return false;
            if (block.workspace && block.workspace !== this.workspace) return false;
            return DIO_OPS.includes(block.type || '');
        };

        // Lee el pin DIO de un bloque desde el workspace.
        // Todos los menús DIO son acceptReporters:false → campo directo.
        const getWSBlockPin = (blockId) => {
            const block = this.workspace.getBlockById(blockId);
            if (!block) return null;
            const op = block.type || '';
            if (!DIO_OPS.includes(op)) return null;
            const argName = op === 'playiot_ledBlink' ? 'LED' : 'PIN';
            const field = block.getField(argName);
            if (!field) return null;
            const val = String(field.getValue());
            return DIO_PINS.includes(val) ? val : null;
        };

        // Devuelve { pin: [blockId, ...] } para todos los bloques DIO del workspace
        const getDIOUsage = (excludeId = null) => {
            const usage = {};
            for (const block of this.workspace.getAllBlocks()) {
                if (block.id === excludeId) continue;
                if (!isRealDIOBlock(block)) continue;
                const pin = getWSBlockPin(block.id);
                if (!pin) continue;
                (usage[pin] = usage[pin] || []).push(block.id);
            }
            return usage;
        };

        // Cambia el pin DIO de un bloque.
        // Todos los menús DIO ahora son acceptReporters:false → campo directo,
        // setValue() funciona sin el bug visual de desconexión de shadow.
        const setBlockPin = (blockId, newPin) => {
            const block = this.workspace.getBlockById(blockId);
            if (!block) return false;
            const op = block.type || '';
            if (!DIO_OPS.includes(op)) return false;
            const argName = op === 'playiot_ledBlink' ? 'LED' : 'PIN';
            const field = block.getField(argName);
            if (!field) return false;
            field.setValue(newPin);
            return true;
        };

        const showDIOToast = (msg, isError = false) => {
            const prev = document.getElementById('playcode-dio-toast');
            if (prev) prev.remove();
            const toast = document.createElement('div');
            toast.id = 'playcode-dio-toast';
            toast.className = `playcode-dio-conflict-toast${isError ? ' playcode-dio-toast-error' : ''}`;
            toast.innerHTML = msg;
            document.body.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('playcode-dio-toast-show'));
            setTimeout(() => {
                toast.classList.remove('playcode-dio-toast-show');
                setTimeout(() => toast.remove(), 300);
            }, 2800);
        };

        const syncUsedPins = () => {
            const usage = getDIOUsage();
            window._playiotUsedDIOPins = new Set(Object.keys(usage));
        };

        const updateDIOWarnings = () => {
            const usage = getDIOUsage();
            syncUsedPins();
            for (const block of this.workspace.getAllBlocks()) {
                if (!isRealDIOBlock(block)) continue;
                const pin = getWSBlockPin(block.id);
                if (!pin) { block.setWarningText(null); continue; }
                const ids = usage[pin] || [];
                block.setWarningText(ids.length > 1 ? `⚠️ DIO${pin} ya está en uso` : null);
            }
        };

        // Ejecuta la lógica de conflicto DIO una vez que el bloque está soltado
        // (ya no se está arrastrando). Reintenta si el workspace sigue con gesto activo
        // para evitar dispose+domToBlock mientras el bloque sigue mid-drag (efecto teleport).
        const runConflictWhenSettled = (priorUsage, priorDIOIds, retries = 0) => {
            if (_dioGuard) return;
            const gesture = this.workspace.currentGesture_;
            if (gesture && gesture.draggingBlock_ && retries < 20) {
                setTimeout(() => runConflictWhenSettled(priorUsage, priorDIOIds, retries + 1), 50);
                return;
            }

            const currentUsage = getDIOUsage();
            let newId = null;
            let pin = null;
            outer: for (const [p, ids] of Object.entries(currentUsage)) {
                for (const id of ids) {
                    if (!priorDIOIds.has(id)) { newId = id; pin = p; break outer; }
                }
            }
            if (!newId || !pin) return;
            if (!(priorUsage[pin] || []).length) return;

            const block = this.workspace.getBlockById(newId);
            if (!block) return;

            const freePin = DIO_PINS.find(p2 => !(priorUsage[p2] || []).length);
            _dioGuard = true;
            try {
                if (freePin) {
                    const ok = setBlockPin(newId, freePin);
                    if (ok) {
                        showDIOToast(`🔄 &nbsp;Pin cambiado a <b>DIO${freePin}</b> — DIO${pin} ya está en uso`);
                        syncUsedPins();
                    }
                } else {
                    const svg = block.getSvgRoot && block.getSvgRoot();
                    if (svg) svg.classList.add('playcode-block-rejected');
                    showDIOToast(`⛔ &nbsp;Todos los pines DIO (2, 5, 23) están en uso`, true);
                    setTimeout(() => {
                        const b = this.workspace.getBlockById(newId);
                        if (b) b.dispose(false);
                        syncUsedPins();
                    }, 380);
                }
            } finally {
                setTimeout(() => { _dioGuard = false; }, 50);
            }
        };

        this._dioConflictListener = (event) => {
            // ── Bloquear selección manual de pin en uso (Issue: pin lockout) ──────────
            if (!_dioGuard && event.type === 'change' && event.element === 'field') {
                const changedBlock = this.workspace.getBlockById(event.blockId);
                const newPin = String(event.newValue || '');
                const oldPinRaw = String(event.oldValue || '');
                if (changedBlock && DIO_PINS.includes(newPin)) {
                    // El cambio puede venir del bloque real (digitalRead) o de su shadow (digitalWrite)
                    let realBlock = null;
                    if (isRealDIOBlock(changedBlock)) {
                        realBlock = changedBlock;
                    } else if (changedBlock.isShadow && changedBlock.isShadow()) {
                        const parent = changedBlock.getParent && changedBlock.getParent();
                        if (parent && isRealDIOBlock(parent)) realBlock = parent;
                    }
                    if (realBlock) {
                        const usage = getDIOUsage(realBlock.id);
                        if ((usage[newPin] || []).length > 0) {
                            const oldPin = String(event.oldValue || '');
                            const freePin = DIO_PINS.find(p => !(usage[p] || []).length);
                            const revertTo = freePin || (DIO_PINS.includes(oldPin) ? oldPin : null);
                            _dioGuard = true;
                            try {
                                if (revertTo) {
                                    setBlockPin(realBlock.id, revertTo);
                                    showDIOToast(
                                        freePin && freePin !== oldPin
                                            ? `⛔ &nbsp;DIO${newPin} ya está en uso — cambiado a <b>DIO${freePin}</b>`
                                            : `⛔ &nbsp;DIO${newPin} ya está en uso`,
                                        true
                                    );
                                } else {
                                    showDIOToast(`⛔ &nbsp;DIO${newPin} ya está en uso`, true);
                                }
                                syncUsedPins();
                            } finally {
                                setTimeout(() => { _dioGuard = false; }, 50);
                            }
                            return;
                        }
                    }
                }
                updateDIOWarnings();
                return;
            }

            // ── Detección de conflicto al arrastrar bloque nuevo ──────────────────────
            if (event.type === 'create' && !_dioGuard) {
                // Snapshot SÍNCRONO: IDs de bloques DIO que existían ANTES de este evento.
                const priorUsage = getDIOUsage(event.blockId);
                const priorDIOIds = new Set(Object.values(priorUsage).flat());
                // Esperar a que el usuario suelte el bloque antes de mover el field
                setTimeout(() => runConflictWhenSettled(priorUsage, priorDIOIds), 80);
                return;
            }

            if (_dioGuard) return;
            if (event.type === 'delete') {
                updateDIOWarnings();
            }
        };
        this.workspace.addChangeListener(this._dioConflictListener);

        // Listen for custom toolbox refresh requests (e.g., from DevicePanel)
        window.addEventListener('scratch_toolbox_refresh_requested', this.handleRefreshToolboxRequest);
        // Reset workspace scroll when switching tabs
        this._handleResetScroll = () => {
            if (this.workspace) this.workspace.scrollCenter();
        };
        window.addEventListener('scratch_workspace_reset_scroll', this._handleResetScroll);

        this.attachVM();
        // Only update blocks/vm locale when visible to avoid sizing issues
        // If locale changes while not visible it will get handled in didUpdate
        if (this.props.isVisible) {
            this.setLocale();
        }
    }
    shouldComponentUpdate(nextProps, nextState) {
        return (
            this.state.prompt !== nextState.prompt ||
            this.props.isVisible !== nextProps.isVisible ||
            this._renderedToolboxXML !== nextProps.toolboxXML ||
            this.props.extensionLibraryVisible !== nextProps.extensionLibraryVisible ||
            this.props.customProceduresVisible !== nextProps.customProceduresVisible ||
            this.props.locale !== nextProps.locale ||
            this.props.anyModalVisible !== nextProps.anyModalVisible ||
            this.props.stageSize !== nextProps.stageSize
        );
    }
    componentDidUpdate(prevProps) {
        // If any modals are open, call hideChaff to close z-indexed field editors
        if (this.props.anyModalVisible && !prevProps.anyModalVisible) {
            this.ScratchBlocks.hideChaff();
        }

        // Only rerender the toolbox when the blocks are visible and the xml is
        // different from the previously rendered toolbox xml.
        // Do not check against prevProps.toolboxXML because that may not have been rendered.
        if (this.props.isVisible && this.props.toolboxXML !== this._renderedToolboxXML) {
            this.requestToolboxUpdate();
        }

        if (this.props.isVisible === prevProps.isVisible) {
            if (this.props.stageSize !== prevProps.stageSize) {
                // force workspace to redraw for the new stage size
                window.dispatchEvent(new Event('resize'));
            }
            return;
        }
        // @todo hack to resize blockly manually in case resize happened while hidden
        // @todo hack to reload the workspace due to gui bug #413
        if (this.props.isVisible) { // Scripts tab
            this.workspace.setVisible(true);
            if (prevProps.locale !== this.props.locale || this.props.locale !== this.props.vm.getLocale()) {
                // call setLocale if the locale has changed, or changed while the blocks were hidden.
                // vm.getLocale() will be out of sync if locale was changed while not visible
                this.setLocale();
            } else {
                this.props.vm.refreshWorkspace();
                this.requestToolboxUpdate();
            }

            window.dispatchEvent(new Event('resize'));
        } else {
            this.workspace.setVisible(false);
        }
    }
    componentWillUnmount() {
        if (this._dioConflictListener) this.workspace.removeChangeListener(this._dioConflictListener);
        if (this._trashPointerDown) document.removeEventListener('pointerdown', this._trashPointerDown);
        if (this._hideTrash) document.removeEventListener('pointerup', this._hideTrash);
        if (this._trashMoveHandler) document.removeEventListener('pointermove', this._trashMoveHandler);
        if (this._trashDragPoll) clearTimeout(this._trashDragPoll);
        if (this._trashHideTimer) clearTimeout(this._trashHideTimer);
        if (this._trashOverlay && this._trashOverlay.parentNode) {
            this._trashOverlay.parentNode.removeChild(this._trashOverlay);
        }
        if (this._connStatusPoll) clearInterval(this._connStatusPoll);
        if (this._connStatusEl && this._connStatusEl.parentNode) {
            this._connStatusEl.parentNode.removeChild(this._connStatusEl);
        }
        this.detachVM();
        this.workspace.dispose();
        clearTimeout(this.toolboxUpdateTimeout);

        // Clear the flyout blocks so that they can be recreated on mount.
        this.props.vm.clearFlyoutBlocks();
        window.removeEventListener('scratch_toolbox_refresh_requested', this.handleRefreshToolboxRequest);
        window.removeEventListener('scratch_workspace_reset_scroll', this._handleResetScroll);
    }
    handleRefreshToolboxRequest = (event) => {
        const extensionId = event.detail && event.detail.extensionId;

        // Update the toolbox XML
        const toolboxXML = this.getToolboxXML();
        if (toolboxXML) {
            this.props.updateToolboxState(toolboxXML);
        }

        // If an extensionId is provided, force selection after update
        if (extensionId) {
            // Use withToolboxUpdates to ensure this runs AFTER the toolbox re-render 
            // triggered by updateToolboxState (via componentDidUpdate)
            this.withToolboxUpdates(() => {
                if (this.workspace && this.workspace.toolbox_) {
                    this.workspace.toolbox_.setSelectedCategoryById(extensionId);
                    // Force the Scrollbar to fix its position as well
                    this.workspace.toolbox_.scrollToCategoryById(extensionId);
                }
            });
        }
    }
    requestToolboxUpdate() {
        clearTimeout(this.toolboxUpdateTimeout);
        this.toolboxUpdateTimeout = setTimeout(() => {
            this.updateToolbox();
        }, 0);
    }
    setLocale() {
        this.ScratchBlocks.ScratchMsgs.setLocale(this.props.locale);
        this.props.vm.setLocale(this.props.locale, this.props.messages)
            .then(() => {
                this.workspace.getFlyout().setRecyclingEnabled(false);
                this.props.vm.refreshWorkspace();
                this.requestToolboxUpdate();
                this.withToolboxUpdates(() => {
                    this.workspace.getFlyout().setRecyclingEnabled(true);
                });
            });
    }

    updateToolbox() {
        this.toolboxUpdateTimeout = false;

        let categoryId = this.workspace.toolbox_.getSelectedCategoryId();
        let offset = this.workspace.toolbox_.getCategoryScrollOffset();

        // If the active device extension ID has changed and is NOT yet synced,
        // we want to try to select it.
        const activeDeviceId = window.activeDeviceExtensionId;
        const forceSwitch = activeDeviceId && activeDeviceId !== this.lastActiveDeviceId;

        this.workspace.updateToolbox(this.props.toolboxXML);
        this._renderedToolboxXML = this.props.toolboxXML;

        this.workspace.toolboxRefreshEnabled_ = true;

        if (this.workspace.toolbox_) {
            // If we are forcing a switch, check if the category exists in the new XML
            if (forceSwitch && this.workspace.toolbox_.getCategoryPositionById(activeDeviceId) !== -1) {
                categoryId = activeDeviceId;
                offset = 0;
                this.lastActiveDeviceId = activeDeviceId; // Mark as synced
            }

            // Apply selection and scroll
            if (categoryId) {
                this.workspace.toolbox_.setSelectedCategoryById(categoryId);
            }

            const currentCategoryPos = this.workspace.toolbox_.getCategoryPositionById(categoryId);
            const currentCategoryLen = this.workspace.toolbox_.getCategoryLengthById(categoryId);

            if (currentCategoryPos !== -1) {
                if (offset < currentCategoryLen) {
                    this.workspace.toolbox_.setFlyoutScrollPos(currentCategoryPos + offset);
                } else {
                    this.workspace.toolbox_.setFlyoutScrollPos(currentCategoryPos);
                }
            }
        }

        const queue = this.toolboxUpdateQueue;
        this.toolboxUpdateQueue = [];
        queue.forEach(fn => fn());
    }

    withToolboxUpdates(fn) {
        // if there is a queued toolbox update, we need to wait
        if (this.toolboxUpdateTimeout) {
            this.toolboxUpdateQueue.push(fn);
        } else {
            fn();
        }
    }

    attachVM() {
        this.workspace.addChangeListener(this.props.vm.blockListener);
        this.flyoutWorkspace = this.workspace
            .getFlyout()
            .getWorkspace();
        this.flyoutWorkspace.addChangeListener(this.props.vm.flyoutBlockListener);
        this.flyoutWorkspace.addChangeListener(this.props.vm.monitorBlockListener);
        this.props.vm.addListener('SCRIPT_GLOW_ON', this.onScriptGlowOn);
        this.props.vm.addListener('SCRIPT_GLOW_OFF', this.onScriptGlowOff);
        this.props.vm.addListener('BLOCK_GLOW_ON', this.onBlockGlowOn);
        this.props.vm.addListener('BLOCK_GLOW_OFF', this.onBlockGlowOff);
        this.props.vm.addListener('VISUAL_REPORT', this.onVisualReport);
        this.props.vm.addListener('workspaceUpdate', this.onWorkspaceUpdate);
        this.props.vm.addListener('targetsUpdate', this.onTargetsUpdate);
        this.props.vm.addListener('MONITORS_UPDATE', this.handleMonitorsUpdate);
        this.props.vm.addListener('EXTENSION_ADDED', this.handleExtensionAdded);
        this.props.vm.addListener('BLOCKSINFO_UPDATE', this.handleBlocksInfoUpdate);
        this.props.vm.addListener('PERIPHERAL_CONNECTED', this.handleStatusButtonUpdate);
        this.props.vm.addListener('PERIPHERAL_DISCONNECTED', this.handleStatusButtonUpdate);
    }
    detachVM() {
        this.props.vm.removeListener('SCRIPT_GLOW_ON', this.onScriptGlowOn);
        this.props.vm.removeListener('SCRIPT_GLOW_OFF', this.onScriptGlowOff);
        this.props.vm.removeListener('BLOCK_GLOW_ON', this.onBlockGlowOn);
        this.props.vm.removeListener('BLOCK_GLOW_OFF', this.onBlockGlowOff);
        this.props.vm.removeListener('VISUAL_REPORT', this.onVisualReport);
        this.props.vm.removeListener('workspaceUpdate', this.onWorkspaceUpdate);
        this.props.vm.removeListener('targetsUpdate', this.onTargetsUpdate);
        this.props.vm.removeListener('MONITORS_UPDATE', this.handleMonitorsUpdate);
        this.props.vm.removeListener('EXTENSION_ADDED', this.handleExtensionAdded);
        this.props.vm.removeListener('BLOCKSINFO_UPDATE', this.handleBlocksInfoUpdate);
        this.props.vm.removeListener('PERIPHERAL_CONNECTED', this.handleStatusButtonUpdate);
        this.props.vm.removeListener('PERIPHERAL_DISCONNECTED', this.handleStatusButtonUpdate);
    }

    updateToolboxBlockValue(id, value) {
        this.withToolboxUpdates(() => {
            const block = this.workspace
                .getFlyout()
                .getWorkspace()
                .getBlockById(id);
            if (block) {
                block.inputList[0].fieldRow[0].setValue(value);
            }
        });
    }

    onTargetsUpdate() {
        if (this.props.vm.editingTarget && this.workspace.getFlyout()) {
            ['glide', 'move', 'set'].forEach(prefix => {
                this.updateToolboxBlockValue(`${prefix}x`, Math.round(this.props.vm.editingTarget.x).toString());
                this.updateToolboxBlockValue(`${prefix}y`, Math.round(this.props.vm.editingTarget.y).toString());
            });
        }
    }
    onWorkspaceMetricsChange() {
        const target = this.props.vm.editingTarget;
        if (target && target.id) {
            // Dispatch updateMetrics later, since onWorkspaceMetricsChange may be (very indirectly)
            // called from a reducer, i.e. when you create a custom procedure.
            // TODO: Is this a vehement hack?
            setTimeout(() => {
                this.props.updateMetrics({
                    targetID: target.id,
                    scrollX: this.workspace.scrollX,
                    scrollY: this.workspace.scrollY,
                    scale: this.workspace.scale
                });
            }, 0);
        }
    }
    onScriptGlowOn(data) {
        this.workspace.glowStack(data.id, true);
    }
    onScriptGlowOff(data) {
        this.workspace.glowStack(data.id, false);
    }
    onBlockGlowOn(data) {
        this.workspace.glowBlock(data.id, true);
    }
    onBlockGlowOff(data) {
        this.workspace.glowBlock(data.id, false);
    }
    onVisualReport(data) {
        this.workspace.reportValue(data.id, data.value);
    }
    getToolboxXML() {
        // Use try/catch because this requires digging pretty deep into the VM
        // Code inside intentionally ignores several error situations (no stage, etc.)
        // Because they would get caught by this try/catch
        try {
            let { editingTarget: target, runtime } = this.props.vm;
            const stage = runtime.getTargetForStage();
            if (!target) target = stage; // If no editingTarget, use the stage

            const stageCostumes = stage.getCostumes();
            const targetCostumes = target.getCostumes();
            const targetSounds = target.getSounds();
            // Device targets have no costumes/sounds — fall back to stage values
            const costumeName = targetCostumes.length > 0
                ? targetCostumes[targetCostumes.length - 1].name
                : (stageCostumes.length > 0 ? stageCostumes[stageCostumes.length - 1].name : '');
            const backdropName = stageCostumes.length > 0
                ? stageCostumes[stageCostumes.length - 1].name : '';
            const soundName = targetSounds.length > 0
                ? targetSounds[targetSounds.length - 1].name : '';
            const dynamicBlocksXML = injectExtensionCategoryTheme(
                this.props.vm.runtime.getBlocksXML(target),
                this.props.theme
            );
            return makeToolboxXML(false, target.isStage, target.id, dynamicBlocksXML,
                costumeName,
                backdropName,
                soundName,
                getColorsForTheme(this.props.theme)
            );
        } catch {
            return null;
        }
    }
    onWorkspaceUpdate(data) {
        // When we change sprites, update the toolbox to have the new sprite's blocks
        const toolboxXML = this.getToolboxXML();
        if (toolboxXML) {
            this.props.updateToolboxState(toolboxXML);
        }

        if (this.props.vm.editingTarget && !this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id]) {
            this.onWorkspaceMetricsChange();
        }

        // Remove and reattach the workspace listener (but allow flyout events)
        this.workspace.removeChangeListener(this.props.vm.blockListener);
        const dom = this.ScratchBlocks.Xml.textToDom(data.xml);
        try {
            this.ScratchBlocks.Xml.clearWorkspaceAndLoadFromXml(dom, this.workspace);
        } catch (error) {
            // The workspace is likely incomplete. What did update should be
            // functional.
            //
            // Instead of throwing the error, by logging it and continuing as
            // normal lets the other workspace update processes complete in the
            // gui and vm, which lets the vm run even if the workspace is
            // incomplete. Throwing the error would keep things like setting the
            // correct editing target from happening which can interfere with
            // some blocks and processes in the vm.
            if (error.message) {
                error.message = `Workspace Update Error: ${error.message}`;
            }
            log.error(error);
        }
        this.workspace.addChangeListener(this.props.vm.blockListener);

        if (this.props.vm.editingTarget && this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id]) {
            const { scrollX, scrollY, scale } = this.props.workspaceMetrics.targets[this.props.vm.editingTarget.id];
            this.workspace.scrollX = scrollX;
            this.workspace.scrollY = scrollY;
            this.workspace.scale = scale;
            this.workspace.resize();
        }

        // Clear the undo state of the workspace since this is a
        // fresh workspace and we don't want any changes made to another sprites
        // workspace to be 'undone' here.
        this.workspace.clearUndo();
    }
    handleMonitorsUpdate(monitors) {
        // Update the checkboxes of the relevant monitors.
        // TODO: What about monitors that have fields? See todo in scratch-vm blocks.js changeBlock:
        // https://github.com/LLK/scratch-vm/blob/2373f9483edaf705f11d62662f7bb2a57fbb5e28/src/engine/blocks.js#L569-L576
        const flyout = this.workspace.getFlyout();
        for (const monitor of monitors.values()) {
            const blockId = monitor.get('id');
            const isVisible = monitor.get('visible');
            flyout.setCheckboxState(blockId, isVisible);
            // We also need to update the isMonitored flag for this block on the VM, since it's used to determine
            // whether the checkbox is activated or not when the checkbox is re-displayed (e.g. local variables/blocks
            // when switching between sprites).
            const block = this.props.vm.runtime.monitorBlocks.getBlock(blockId);
            if (block) {
                block.isMonitored = isVisible;
            }
        }
    }
    handleExtensionAdded(categoryInfo) {
        const defineBlocks = blockInfoArray => {
            if (blockInfoArray && blockInfoArray.length > 0) {
                const staticBlocksJson = [];
                const dynamicBlocksInfo = [];
                blockInfoArray.forEach(blockInfo => {
                    if (blockInfo.info && blockInfo.info.isDynamic) {
                        dynamicBlocksInfo.push(blockInfo);
                    } else if (blockInfo.json) {
                        staticBlocksJson.push(injectExtensionBlockTheme(blockInfo.json, this.props.theme));
                    }
                    // otherwise it's a non-block entry such as '---'
                });

                this.ScratchBlocks.defineBlocksWithJsonArray(staticBlocksJson);
                dynamicBlocksInfo.forEach(blockInfo => {
                    // This is creating the block factory / constructor -- NOT a specific instance of the block.
                    // The factory should only know static info about the block: the category info and the opcode.
                    // Anything else will be picked up from the XML attached to the block instance.
                    const extendedOpcode = `${categoryInfo.id}_${blockInfo.info.opcode}`;
                    const blockDefinition =
                        defineDynamicBlock(this.ScratchBlocks, categoryInfo, blockInfo, extendedOpcode);
                    this.ScratchBlocks.Blocks[extendedOpcode] = blockDefinition;
                });
            }
        };

        // scratch-blocks implements a menu or custom field as a special kind of block ("shadow" block)
        // these actually define blocks and MUST run regardless of the UI state
        defineBlocks(
            Object.getOwnPropertyNames(categoryInfo.customFieldTypes)
                .map(fieldTypeName => categoryInfo.customFieldTypes[fieldTypeName].scratchBlocksDefinition));
        defineBlocks(categoryInfo.menus);
        defineBlocks(categoryInfo.blocks);

        // Update the toolbox with new blocks if possible
        const toolboxXML = this.getToolboxXML();
        if (toolboxXML) {
            this.props.updateToolboxState(toolboxXML);
        }
    }
    handleBlocksInfoUpdate(categoryInfo) {
        // Skip re-registering blocks that are already defined to avoid Blockly warnings
        const alreadyDefined = type => !!this.ScratchBlocks.Blocks[type];
        const filteredCategoryInfo = Object.assign({}, categoryInfo, {
            menus: (categoryInfo.menus || []).filter(b => !b.json || !alreadyDefined(b.json.type)),
            blocks: (categoryInfo.blocks || []).filter(b => !b.json || !alreadyDefined(b.json.type))
        });
        this.handleExtensionAdded(filteredCategoryInfo);
    }
    handleCategorySelected(categoryId) {
        const extension = extensionData.find(ext => ext.extensionId === categoryId);
        if (extension && extension.launchPeripheralConnectionFlow) {
            this.handleConnectionModalStart(categoryId);
        }

        this.withToolboxUpdates(() => {
            this.workspace.toolbox_.setSelectedCategoryById(categoryId);
        });
    }
    setBlocks(blocks) {
        this.blocks = blocks;
    }
    handlePromptStart(message, defaultValue, callback, optTitle, optVarType) {
        const p = { prompt: { callback, message, defaultValue } };
        p.prompt.title = optTitle ? optTitle :
            this.ScratchBlocks.Msg.VARIABLE_MODAL_TITLE;
        p.prompt.varType = typeof optVarType === 'string' ?
            optVarType : this.ScratchBlocks.SCALAR_VARIABLE_TYPE;
        p.prompt.showVariableOptions = // This flag means that we should show variable/list options about scope
            optVarType !== this.ScratchBlocks.BROADCAST_MESSAGE_VARIABLE_TYPE &&
            p.prompt.title !== this.ScratchBlocks.Msg.RENAME_VARIABLE_MODAL_TITLE &&
            p.prompt.title !== this.ScratchBlocks.Msg.RENAME_LIST_MODAL_TITLE;
        p.prompt.showCloudOption = (optVarType === this.ScratchBlocks.SCALAR_VARIABLE_TYPE) && this.props.canUseCloud;
        this.setState(p);
    }
    handleConnectionModalStart(extensionId) {
        this.props.onOpenConnectionModal(extensionId);
    }
    handleStatusButtonUpdate() {
        this.ScratchBlocks.refreshStatusButtons(this.workspace);
    }
    handleOpenSoundRecorder() {
        this.props.onOpenSoundRecorder();
    }

    /*
     * Pass along information about proposed name and variable options (scope and isCloud)
     * and additional potentially conflicting variable names from the VM
     * to the variable validation prompt callback used in scratch-blocks.
     */
    handlePromptCallback(input, variableOptions) {
        this.state.prompt.callback(
            input,
            this.props.vm.runtime.getAllVarNamesOfType(this.state.prompt.varType),
            variableOptions);
        this.handlePromptClose();
    }
    handlePromptClose() {
        this.setState({ prompt: null });
    }
    handleCustomProceduresClose(data) {
        this.props.onRequestCloseCustomProcedures(data);
        const ws = this.workspace;
        ws.refreshToolboxSelection_();
        ws.toolbox_.scrollToCategoryById('myBlocks');
    }
    handleDrop(dragInfo) {
        fetch(dragInfo.payload.bodyUrl)
            .then(response => response.json())
            .then(blocks => this.props.vm.shareBlocksToTarget(blocks, this.props.vm.editingTarget.id))
            .then(() => {
                this.props.vm.refreshWorkspace();
                this.updateToolbox(); // To show new variables/custom blocks
            });
    }
    render() {
        /* eslint-disable no-unused-vars */
        const {
            anyModalVisible,
            canUseCloud,
            customProceduresVisible,
            extensionLibraryVisible,
            options,
            stageSize,
            vm,
            isRtl,
            isVisible,
            onActivateColorPicker,
            onOpenConnectionModal,
            onOpenSoundRecorder,
            updateToolboxState,
            onActivateCustomProcedures,
            onRequestCloseExtensionLibrary,
            onRequestCloseCustomProcedures,
            toolboxXML,
            updateMetrics: updateMetricsProp,
            useCatBlocks,
            workspaceMetrics,
            ...props
        } = this.props;
        /* eslint-enable no-unused-vars */
        return (
            <React.Fragment>
                <DroppableBlocks
                    componentRef={this.setBlocks}
                    onDrop={this.handleDrop}
                    {...props}
                />
                {this.state.prompt ? (
                    <Prompt
                        defaultValue={this.state.prompt.defaultValue}
                        isStage={vm.runtime.getEditingTarget().isStage}
                        showListMessage={this.state.prompt.varType === this.ScratchBlocks.LIST_VARIABLE_TYPE}
                        label={this.state.prompt.message}
                        showCloudOption={this.state.prompt.showCloudOption}
                        showVariableOptions={this.state.prompt.showVariableOptions}
                        title={this.state.prompt.title}
                        vm={vm}
                        onCancel={this.handlePromptClose}
                        onOk={this.handlePromptCallback}
                    />
                ) : null}
                {extensionLibraryVisible ? (
                    <ExtensionLibrary
                        vm={vm}
                        onCategorySelected={this.handleCategorySelected}
                        onRequestClose={onRequestCloseExtensionLibrary}
                    />
                ) : null}
                {customProceduresVisible ? (
                    <CustomProcedures
                        options={{
                            media: options.media
                        }}
                        onRequestClose={this.handleCustomProceduresClose}
                    />
                ) : null}
            </React.Fragment>
        );
    }
}

Blocks.propTypes = {
    anyModalVisible: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    customProceduresVisible: PropTypes.bool,
    extensionLibraryVisible: PropTypes.bool,
    isRtl: PropTypes.bool,
    isVisible: PropTypes.bool,
    locale: PropTypes.string.isRequired,
    messages: PropTypes.objectOf(PropTypes.string),
    onActivateColorPicker: PropTypes.func,
    onActivateCustomProcedures: PropTypes.func,
    onOpenConnectionModal: PropTypes.func,
    onOpenSoundRecorder: PropTypes.func,
    onRequestCloseCustomProcedures: PropTypes.func,
    onRequestCloseExtensionLibrary: PropTypes.func,
    options: PropTypes.shape({
        media: PropTypes.string,
        zoom: PropTypes.shape({
            controls: PropTypes.bool,
            wheel: PropTypes.bool,
            startScale: PropTypes.number
        }),
        comments: PropTypes.bool,
        collapse: PropTypes.bool
    }),
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    theme: PropTypes.oneOf(Object.keys(themeMap)),
    toolboxXML: PropTypes.string,
    updateMetrics: PropTypes.func,
    updateToolboxState: PropTypes.func,
    useCatBlocks: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired,
    workspaceMetrics: PropTypes.shape({
        targets: PropTypes.objectOf(PropTypes.object)
    })
};

Blocks.defaultOptions = {
    zoom: {
        controls: true,
        wheel: true,
        startScale: BLOCKS_DEFAULT_SCALE
    },
    grid: {
        spacing: 40,
        length: 2,
        colour: '#ddd'
    },
    comments: true,
    collapse: false,
    sounds: false
};

Blocks.defaultProps = {
    isVisible: true,
    options: Blocks.defaultOptions,
    theme: DEFAULT_THEME
};

const mapStateToProps = state => ({
    anyModalVisible: (
        Object.keys(state.scratchGui.modals).some(key => state.scratchGui.modals[key]) ||
        state.scratchGui.mode.isFullScreen
    ),
    extensionLibraryVisible: state.scratchGui.modals.extensionLibrary,
    isRtl: state.locales.isRtl,
    locale: state.locales.locale,
    messages: state.locales.messages,
    toolboxXML: state.scratchGui.toolbox.toolboxXML,
    customProceduresVisible: state.scratchGui.customProcedures.active,
    workspaceMetrics: state.scratchGui.workspaceMetrics,
    useCatBlocks: isTimeTravel2020(state)
});

const mapDispatchToProps = dispatch => ({
    onActivateColorPicker: callback => dispatch(activateColorPicker(callback)),
    onActivateCustomProcedures: (data, callback) => dispatch(activateCustomProcedures(data, callback)),
    onOpenConnectionModal: id => {
        dispatch(setConnectionModalExtensionId(id));
        dispatch(openConnectionModal());
    },
    onOpenSoundRecorder: () => {
        dispatch(activateTab(SOUNDS_TAB_INDEX));
        dispatch(openSoundRecorder());
    },
    onRequestCloseExtensionLibrary: () => {
        dispatch(closeExtensionLibrary());
    },
    onRequestCloseCustomProcedures: data => {
        dispatch(deactivateCustomProcedures(data));
    },
    updateToolboxState: toolboxXML => {
        dispatch(updateToolbox(toolboxXML));
    },
    updateMetrics: metrics => {
        dispatch(updateMetrics(metrics));
    }
});

export default errorBoundaryHOC('Blocks')(
    connect(
        mapStateToProps,
        mapDispatchToProps
    )(Blocks)
);
