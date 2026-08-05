import PropTypes from 'prop-types';
import React from 'react';
import { defineMessages, injectIntl, intlShape } from 'react-intl';

import Box from '../box/box.jsx';
import SpriteInfo from '../../containers/sprite-info.jsx';
import SpriteList from './sprite-list.jsx';
import ActionMenu from '../action-menu/action-menu.jsx';
import Tabs from './tabs.jsx';
import DevicePanel from './device-panel.jsx';
import FirmwareUpdaterModal from './firmware-updater-modal.jsx';
import ProgramUploadModal from './program-upload-modal.jsx';
import RemoteControlModal from './remote-control-modal.jsx';
import StageSelector from '../../containers/stage-selector.jsx';
import { STAGE_DISPLAY_SIZES } from '../../lib/layout-constants';
import { isRtl } from 'scratch-l10n';
import playiot from '../../lib/libraries/extensions/playiot';
import playme from '../../lib/libraries/extensions/playme';
import playgo from '../../lib/libraries/extensions/playgo';
import playboard from '../../lib/libraries/extensions/playboard';
import extensionModalStyles from './extension-modal.css';

// El modal "Agregar dispositivo" (panel de Dispositivos) SOLO debe listar
// dispositivos de hardware (PlayIoT, PlayMe, PlayGo, PlayBoard), no extensiones de
// software como Teachable Machine. Esa es una lista aparte de
// lib/libraries/extensions/index.jsx, que alimenta el botón general "Agregar
// Extensión" del área de bloques.
const deviceLibrary = [playiot, playme, playgo, playboard];

import styles from './sprite-selector.css';

import fileUploadIcon from '../action-menu/icon--file-upload.svg';
import paintIcon from '../action-menu/icon--paint.svg';
import spriteIcon from '../action-menu/icon--sprite.svg';
import surpriseIcon from '../action-menu/icon--surprise.svg';
import searchIcon from '../action-menu/icon--search.svg';

const messages = defineMessages({
    addSpriteFromLibrary: {
        id: 'gui.spriteSelector.addSpriteFromLibrary',
        description: 'Button to add a sprite in the target pane from library',
        defaultMessage: 'Choose a Sprite'
    },
    addSpriteFromPaint: {
        id: 'gui.spriteSelector.addSpriteFromPaint',
        description: 'Button to add a sprite in the target pane from paint',
        defaultMessage: 'Paint'
    },
    addSpriteFromSurprise: {
        id: 'gui.spriteSelector.addSpriteFromSurprise',
        description: 'Button to add a random sprite in the target pane',
        defaultMessage: 'Surprise'
    },
    addSpriteFromFile: {
        id: 'gui.spriteSelector.addSpriteFromFile',
        description: 'Button to add a sprite in the target pane from file',
        defaultMessage: 'Upload Sprite'
    }
});

class SpriteSelectorComponent extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            activeTab: 1,
            selectedDeviceIndex: 0,
            devices: [
                {
                    id: 'playiot_1',
                    name: 'PlayIoT',
                    icon: playiot.insetIconURL,
                    isConnected: false,
                    port: null,
                    baudRate: 115200,
                    extensionId: 'playiot'
                }
            ],
            showExtensionModal: false,
            showFirmwareModal: false,
            isUpdatingFirmware: false,
            isReconnecting: false,
            firmwareStatus: null,  // null | 'updated' | 'outdated'
            firmwareChecking: false,
            // Modo autónomo: subida del programa compilado a la placa.
            showUploadModal: false,
            uploadTargetId: null,  // target cuyos bloques se están subiendo
            showRemoteModal: false,
            programStatus: null    // {st, sz, crc, err} tal como lo reporta la placa
        };
        this.connectionCheckInterval = null;
        this._rxCheckTimers = {};
        this._fwPollIntervals = {};
        this._programPollInterval = null;
    }

    componentDidMount() {
        // Cargar la extensión PlayIoT por defecto (necesario para registrar bloques en ScratchBlocks)
        if (this.props.onLoadExtension) {
            this.props.onLoadExtension('playiot');
        }

        // NO crear el device target aquí — la VM puede no estar lista.
        // Se crea de forma lazy en handleTabChange cuando el usuario abre Dispositivos por primera vez.

        window.activeDeviceExtensionId = null;
        window.activeDeviceIds = new Set(['playiot']);

        // Al cargar un proyecto nuevo: volver a tab Objetos con el primer sprite.
        this._handleProjectLoaded = () => {
            const vm = this.props.vm;

            // Desconectar dispositivos activos al cambiar de proyecto
            this.state.devices.forEach(device => {
                const peripheral = vm.runtime.peripheralExtensions &&
                    vm.runtime.peripheralExtensions[device.extensionId];
                if (peripheral && peripheral.isConnected()) {
                    peripheral.disconnect();
                }
            });

            // Limpiar device targets cacheados
            this.setState(prevState => ({
                activeTab: 1,
                devices: prevState.devices.map(d => ({ ...d, targetId: null }))
            }));

            window.activeDeviceExtensionId = null;
            window.dispatchEvent(new CustomEvent('scratch_workspace_reset_scroll'));
            window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {}));

            // Seleccionar el primer sprite directamente desde la VM (los props aún no se actualizaron)
            if (vm) {
                const firstSprite = vm.runtime.targets.find(t => !t.isStage && !t.isDeviceTarget);
                if (firstSprite) {
                    vm.setEditingTarget(firstSprite.id);
                }
            }
        };
        if (this.props.vm) {
            this.props.vm.runtime.on('PROJECT_LOADED', this._handleProjectLoaded);
        }

        // Actualizar estado de conexión cada 500ms
        this.connectionCheckInterval = setInterval(this.checkConnectionStatus, 500);
    }

    componentWillUnmount() {
        // Limpiar interval
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
        }
        // Limpiar timers de check de RX pendientes
        Object.values(this._rxCheckTimers).forEach(timer => clearTimeout(timer));
        this._rxCheckTimers = {};
        // Limpiar polls de verificación de firmware
        Object.values(this._fwPollIntervals).forEach(id => clearInterval(id));
        this._fwPollIntervals = {};
        // Limpiar listener de proyecto
        if (this.props.vm && this._handleProjectLoaded) {
            this.props.vm.runtime.off('PROJECT_LOADED', this._handleProjectLoaded);
        }
    }

    checkConnectionStatus = () => {
        const { devices } = this.state;
        const { vm } = this.props;
        let hasChanges = false;

        const updatedDevices = devices.map(device => {
            const extensionId = device.extensionId;
            const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions[extensionId];

            if (peripheral) {
                const isConnected = peripheral.isConnected();
                const port = isConnected ?
                    (peripheral._connectedDeviceId || 'Conectado') :
                    null;

                // Detectar transición desconectado → conectado: iniciar polling de firmware
                if (!device.isConnected && isConnected && !this._fwPollIntervals[extensionId]) {
                    this.setState({ firmwareChecking: true, firmwareStatus: null });
                    const startTime = Date.now();
                    this._fwPollIntervals[extensionId] = setInterval(() => {
                        const peripheral2 = this.props.vm.runtime.peripheralExtensions &&
                            this.props.vm.runtime.peripheralExtensions[extensionId];
                        if (!peripheral2) return;
                        const status = typeof peripheral2.getFirmwareStatus === 'function'
                            ? peripheral2.getFirmwareStatus()
                            : null;
                        const elapsed = Date.now() - startTime;
                        if (status === 'updated') {
                            clearInterval(this._fwPollIntervals[extensionId]);
                            delete this._fwPollIntervals[extensionId];
                            this.setState({ firmwareChecking: false, firmwareStatus: 'updated' });
                            setTimeout(() => this.setState({ firmwareStatus: null }), 10000);
                        } else if (status === 'outdated' || elapsed >= 8000) {
                            clearInterval(this._fwPollIntervals[extensionId]);
                            delete this._fwPollIntervals[extensionId];
                            this.setState({ firmwareChecking: false, firmwareStatus: 'outdated' });
                        }
                    }, 1500);
                }

                // Si se desconecta mientras se verificaba, cancelar el polling
                if (device.isConnected && !isConnected && this._fwPollIntervals[extensionId]) {
                    clearInterval(this._fwPollIntervals[extensionId]);
                    delete this._fwPollIntervals[extensionId];
                    this.setState({ firmwareChecking: false, firmwareStatus: null });
                }

                if (device.isConnected !== isConnected || device.port !== port) {
                    hasChanges = true;
                    return {
                        ...device,
                        isConnected: isConnected,
                        port: port
                    };
                }
            }
            return device;
        });

        if (hasChanges) {
            this.setState({ devices: updatedDevices });
        }

        // Estado del programa autónomo del dispositivo seleccionado. Se lee en
        // este mismo ciclo (que ya corre cada 500 ms) en vez de montar otro
        // timer: el peripheral lo mantiene al día desde la telemetría.
        const selected = devices[this.state.selectedDeviceIndex];
        if (selected) {
            const selectedPeripheral = vm.runtime.peripheralExtensions &&
                vm.runtime.peripheralExtensions[selected.extensionId];
            // Sin conexión no llega telemetría, así que el último estado
            // conocido está desfasado: mejor no mostrar nada que mentir.
            const connected = selectedPeripheral && selectedPeripheral.isConnected();
            const status = (connected && selectedPeripheral.programStatus) || null;
            const current = this.state.programStatus;
            const changed = (status && current) ?
                (status.st !== current.st || status.sz !== current.sz) :
                (status !== current);
            if (changed) this.setState({ programStatus: status });
        }
    }

    handleTabChange = (tabIndex) => {
        this.setState({ activeTab: tabIndex });
        window.dispatchEvent(new CustomEvent('scratch_workspace_reset_scroll'));
        const { onSelectSprite, selectedId, stage, sprites } = this.props;

        if (tabIndex === 0) {
            // Dispositivos: cambiar editing target al del dispositivo seleccionado
            const { selectedDeviceIndex, devices } = this.state;
            const device = devices[selectedDeviceIndex];
            if (device && this.props.vm) {
                window.activeDeviceExtensionId = device.extensionId;

                // Buscar el target correcto: primero verificar si el cacheado sigue válido,
                // luego buscar en la VM (puede haber sido cargado desde archivo),
                // finalmente crear uno nuevo si no existe.
                let { targetId } = device;
                const vm = this.props.vm;

                const cachedStillValid = targetId && !!vm.runtime.getTargetById(targetId);
                if (!cachedStillValid) {
                    // Buscar en la VM un device target con el mismo extensionId (cargado desde archivo)
                    const existingInVM = vm.runtime.targets.find(
                        t => t.isDeviceTarget && t.deviceExtensionId === device.extensionId
                    );
                    if (existingInVM) {
                        targetId = existingInVM.id;
                    } else {
                        targetId = vm.createDeviceTarget(device.extensionId, device.name);
                    }
                    this.setState(prevState => ({
                        devices: prevState.devices.map(d =>
                            d.extensionId === device.extensionId ? { ...d, targetId } : d
                        )
                    }));
                }

                vm.setEditingTarget(targetId);
                vm.refreshWorkspace();

                window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {
                    detail: { extensionId: device.extensionId }
                }));
            }
        } else if (tabIndex === 1) {
            // Objetos: resetear device mode y restaurar editing target al sprite
            window.activeDeviceExtensionId = null;
            window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {}));
            if (!onSelectSprite) return;
            const spriteList = Object.values(sprites || {})
                .sort((a, b) => (a.order || 0) - (b.order || 0));
            const isOnStage = stage && selectedId === stage.id;
            // Si el selectedId actual es un device target o el escenario, buscar el primer sprite real
            const isDeviceSelected = !sprites[selectedId] && !isOnStage;
            if (isOnStage || !selectedId || isDeviceSelected) {
                if (spriteList.length > 0 && spriteList[0].id) {
                    onSelectSprite(spriteList[0].id);
                }
            } else {
                onSelectSprite(selectedId);
            }
        } else if (tabIndex === 2 && stage && stage.id) {
            // Fondo: resetear device mode y mostrar código del escenario
            window.activeDeviceExtensionId = null;
            window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {}));
            if (onSelectSprite) onSelectSprite(stage.id);
        }
    }

    handleSelectDevice = (index) => {
        this.setState({ selectedDeviceIndex: index }, () => {
            const device = this.state.devices[index];
            if (!device) return;

            window.activeDeviceExtensionId = device.extensionId;
            if (window.activeDeviceIds instanceof Set) {
                window.activeDeviceIds.add(device.extensionId);
            }

            if (this.props.vm) {
                const vm = this.props.vm;
                let { targetId } = device;
                const cachedStillValid = targetId && !!vm.runtime.getTargetById(targetId);
                if (!cachedStillValid) {
                    const existingInVM = vm.runtime.targets.find(
                        t => t.isDeviceTarget && t.deviceExtensionId === device.extensionId
                    );
                    targetId = existingInVM ? existingInVM.id
                        : vm.createDeviceTarget(device.extensionId, device.name);
                    this.setState(prevState => ({
                        devices: prevState.devices.map(d =>
                            d.extensionId === device.extensionId ? { ...d, targetId } : d
                        )
                    }));
                }
                vm.setEditingTarget(targetId);
                vm.refreshWorkspace();
            }

            // Refrescar toolbox para mostrar bloques del dispositivo
            window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {
                detail: { extensionId: device.extensionId }
            }));
        });
    }

    handleOpenExtensionModal = () => {
        this.setState({ showExtensionModal: true });
    }

    handleCloseExtensionModal = () => {
        this.setState({ showExtensionModal: false });
    }

    handleSelectExtension = (extension) => {
        // Verificar si ya existe un dispositivo con esta extensión
        const existingDevice = this.state.devices.find(d => d.extensionId === extension.extensionId);

        if (existingDevice) {
            // Si ya existe, solo cámbialo a seleccionado
            const index = this.state.devices.indexOf(existingDevice);
            this.setState({
                selectedDeviceIndex: index,
                showExtensionModal: false
            }, () => {
                if (existingDevice.targetId && this.props.vm) {
                    this.props.vm.setEditingTarget(existingDevice.targetId);
                    this.props.vm.refreshWorkspace();
                }
            });
        } else {
            // Crear target en la VM para este dispositivo
            let targetId = null;
            if (this.props.vm) {
                targetId = this.props.vm.createDeviceTarget(extension.extensionId, extension.name);
            }

            const newDevice = {
                id: `${extension.extensionId}_${Date.now()}`,
                name: extension.name,
                icon: extension.insetIconURL,
                isConnected: false,
                port: null,
                baudRate: 115200,
                extensionId: extension.extensionId,
                targetId
            };

            this.setState(prevState => ({
                devices: [...prevState.devices, newDevice],
                selectedDeviceIndex: prevState.devices.length,
                showExtensionModal: false
            }), () => {
                if (targetId && this.props.vm) {
                    this.props.vm.setEditingTarget(targetId);
                    this.props.vm.refreshWorkspace();
                }
            });
        }

        // Set global tracker
        window.activeDeviceExtensionId = extension.extensionId;
        if (!(window.activeDeviceIds instanceof Set)) window.activeDeviceIds = new Set();
        window.activeDeviceIds.add(extension.extensionId);

        // Cargar la extensión
        if (this.props.onLoadExtension) {
            this.props.onLoadExtension(extension.extensionId);
        }

        // Force toolbox refresh and scroll to extension
        window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {
            detail: { extensionId: extension.extensionId }
        }));
    }

    handleAddDevice = () => {
        this.handleOpenExtensionModal();
    }

    handleRemoveDevice = (index) => {
        const deviceToRemove = this.state.devices[index];
        if (!deviceToRemove) return;

        // Si está conectado, desconectarlo primero
        if (deviceToRemove.isConnected && this.props.onDeviceDisconnect) {
            this.props.onDeviceDisconnect(deviceToRemove.extensionId);
        }

        // Eliminar el target de la VM
        if (deviceToRemove.targetId && this.props.vm) {
            this.props.vm.deleteDeviceTarget(deviceToRemove.targetId);
        }

        const newDevices = this.state.devices.filter((_, i) => i !== index);
        const newSelectedIndex = Math.max(0, index - 1);

        // Quitar del set de dispositivos permitidos
        if (window.activeDeviceIds instanceof Set) {
            window.activeDeviceIds.delete(deviceToRemove.extensionId);
        }

        if (newDevices.length > 0) {
            window.activeDeviceExtensionId = newDevices[newSelectedIndex].extensionId;
        } else {
            window.activeDeviceExtensionId = null;
        }

        this.setState({
            devices: newDevices,
            selectedDeviceIndex: newSelectedIndex
        }, () => {
            // Cambiar editing target al nuevo dispositivo seleccionado (o al escenario)
            if (newDevices.length > 0 && newDevices[newSelectedIndex].targetId && this.props.vm) {
                this.props.vm.setEditingTarget(newDevices[newSelectedIndex].targetId);
                this.props.vm.refreshWorkspace();
            } else if (newDevices.length === 0 && this.props.vm) {
                const stage = this.props.vm.runtime.getTargetForStage();
                if (stage) {
                    this.props.vm.setEditingTarget(stage.id);
                    this.props.vm.refreshWorkspace();
                }
            }

            window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {
                detail: {
                    extensionId: newDevices.length > 0 ? newDevices[newSelectedIndex].extensionId : null
                }
            }));
        });
    }

    handleDeviceConnect = () => {
        const { selectedDeviceIndex, devices } = this.state;
        const device = devices[selectedDeviceIndex];
        if (device && this.props.onDeviceConnect) {
            this.props.onDeviceConnect(device.extensionId);
        }
    }

    handleDeviceDisconnect = () => {
        const { selectedDeviceIndex, devices } = this.state;
        const device = devices[selectedDeviceIndex];
        if (device && this.props.onDeviceDisconnect) {
            this.props.onDeviceDisconnect(device.extensionId);
        }
    }

    /**
     * Resuelve (creándolo si hace falta) el target que guarda los bloques del
     * dispositivo seleccionado. Mismo patrón que handleTabChange: el id
     * cacheado puede haber quedado obsoleto al cargar un proyecto.
     */
    resolveDeviceTargetId = device => {
        const { vm } = this.props;
        if (!device || !vm) return null;

        if (device.targetId && vm.runtime.getTargetById(device.targetId)) {
            return device.targetId;
        }
        const existing = vm.runtime.targets.find(
            t => t.isDeviceTarget && t.deviceExtensionId === device.extensionId
        );
        const targetId = existing ?
            existing.id :
            vm.createDeviceTarget(device.extensionId, device.name);

        this.setState(prev => ({
            devices: prev.devices.map(d => (
                d.extensionId === device.extensionId ? { ...d, targetId } : d
            ))
        }));
        return targetId;
    }

    handleUploadProgram = () => {
        const { selectedDeviceIndex, devices } = this.state;
        const device = devices[selectedDeviceIndex];
        if (!device) return;

        // Sin esto, "Subir a la placa" compilaría los bloques del sprite que
        // estuviera abierto en vez de los del robot. Se guarda el id resuelto
        // en el estado en vez de leerlo luego de `devices`, para no depender
        // de en qué orden cuajen los dos setState.
        const targetId = this.resolveDeviceTargetId(device);
        this.setState({ showUploadModal: true, uploadTargetId: targetId });
    }

    handleCloseUploadModal = () => {
        this.setState({ showUploadModal: false, uploadTargetId: null });
        // Refrescar el estado del programa que muestra el panel.
        const { selectedDeviceIndex, devices } = this.state;
        const device = devices[selectedDeviceIndex];
        const peripheral = device && this.props.vm.runtime.peripheralExtensions &&
            this.props.vm.runtime.peripheralExtensions[device.extensionId];
        if (peripheral && typeof peripheral.queryProgram === 'function') {
            peripheral.queryProgram().catch(() => { });
        }
    }

    handleOpenRemote = () => {
        this.setState({ showRemoteModal: true });
    }

    handleCloseRemote = () => {
        this.setState({ showRemoteModal: false });
    }

    handleEraseProgram = async () => {
        const { selectedDeviceIndex, devices } = this.state;
        const device = devices[selectedDeviceIndex];
        const peripheral = device && this.props.vm.runtime.peripheralExtensions &&
            this.props.vm.runtime.peripheralExtensions[device.extensionId];
        if (!peripheral || typeof peripheral.eraseProgram !== 'function') return;

        // Se confirma porque no hay deshacer: el programa vive solo en la
        // memoria del robot, y los bloques del proyecto pueden haber cambiado
        // desde que se subió.
        const ok = window.confirm(
            '¿Borrar el programa que está guardado en el robot?\n\n' +
            'El robot dejará de funcionar solo cuando lo enciendas. ' +
            'Tus bloques no se borran: puedes volver a subirlos cuando quieras.'
        );
        if (!ok) return;

        try {
            await peripheral.eraseProgram();
            this.setState({ programStatus: peripheral.programStatus || null });
        } catch (e) {
            console.warn('No se pudo borrar el programa de la placa:', e);
        }
    }

    handleStopProgram = async () => {
        const { selectedDeviceIndex, devices } = this.state;
        const device = devices[selectedDeviceIndex];
        const peripheral = device && this.props.vm.runtime.peripheralExtensions &&
            this.props.vm.runtime.peripheralExtensions[device.extensionId];
        if (!peripheral || typeof peripheral.stopProgram !== 'function') return;

        try {
            await peripheral.stopProgram();
            this.setState({ programStatus: peripheral.programStatus || null });
        } catch (e) {
            console.warn('No se pudo detener el programa de la placa:', e);
        }
    }

    handleFirmwareUpdate = async () => {
        const { selectedDeviceIndex, devices } = this.state;
        const { vm } = this.props;
        const device = devices[selectedDeviceIndex];

        if (!device) return;

        console.log('Update firmware for:', device);

        const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions[device.extensionId];

        if (peripheral && peripheral.getSerialPort && peripheral.getSerialPort()) {
            const port = peripheral.getSerialPort();
            if (peripheral._serial) await peripheral._serial.releasePort();
            // Extra wait for CH340 driver to release the OS port handle
            await new Promise(resolve => setTimeout(resolve, 300));

            this.setState({
                showFirmwareModal: true,
                activeUpdatingPort: port
            });
        } else {
            // Si no hay puerto abierto, solo abrimos el modal
            // El modal del usuario pedía un puerto, pero en nuestro caso 
            // el botón de actualizar solo aparece si está conectado.
            console.warn('No se encontró puerto activo para la actualización.');
            this.setState({
                showFirmwareModal: true,
                activeUpdatingPort: null
            });
        }
    }

    handleCloseFirmwareModal = async () => {
        const { selectedDeviceIndex, devices, activeUpdatingPort } = this.state;
        const { vm } = this.props;
        const device = devices[selectedDeviceIndex];

        this.setState({
            showFirmwareModal: false,
            activeUpdatingPort: null
        });

        // PlayIoT y PlayGo (ambos con puente CH340 + reset por DTR/RTS) reconectan
        // desde aquí; PlayMe (USB-JTAG nativo) ya reconectó desde onReconnect del modal.
        if (device && activeUpdatingPort && device.extensionId !== 'playme') {
            const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions[device.extensionId];

            if (peripheral && typeof peripheral.reconnect === 'function') {
                this.setState({ isReconnecting: true });
                await new Promise(resolve => setTimeout(resolve, 4000));
                await peripheral.reconnect(activeUpdatingPort);
                this.setState({ isReconnecting: false });
            } else if (peripheral && peripheral._serial) {
                this.setState({ isReconnecting: true });
                await new Promise(resolve => setTimeout(resolve, 4000));
                await peripheral._serial.claimPort(activeUpdatingPort);
                this.setState({ isReconnecting: false });
            }
        }
    }

    handleReconnect = (port) => {
        const { selectedDeviceIndex, devices } = this.state;
        const { vm } = this.props;
        const device = devices[selectedDeviceIndex];
        if (!device || !port) return;
        const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions[device.extensionId];
        if (peripheral && typeof peripheral.reconnect === 'function') {
            peripheral.reconnect(port);
        }
    }

    handleUpdatingChange = (isUpdating) => {
        this.setState({ isUpdatingFirmware: isUpdating });
    }

    render() {
        const {
            editingTarget,
            hoveredTarget,
            intl,
            onChangeSpriteDirection,
            onChangeSpriteName,
            onChangeSpriteRotationStyle,
            onChangeSpriteSize,
            onChangeSpriteVisibility,
            onChangeSpriteX,
            onChangeSpriteY,
            onDrop,
            onDeleteSprite,
            onDuplicateSprite,
            onExportSprite,
            onFileUploadClick,
            onNewSpriteClick,
            onPaintSpriteClick,
            onSelectSprite,
            onSpriteUpload,
            onSurpriseSpriteClick,
            raised,
            selectedId,
            spriteFileInput,
            sprites,
            stage,
            stageSize,
            ...componentProps
        } = this.props;

        let selectedSprite = sprites[selectedId];
        let spriteInfoDisabled = false;
        if (typeof selectedSprite === 'undefined') {
            selectedSprite = {};
            spriteInfoDisabled = true;
        }

        const tabs = ['Dispositivos', 'Objetos', 'Fondo'];
        const { showExtensionModal, devices, selectedDeviceIndex } = this.state;

        return (
            <Box
                className={styles.spriteSelector}
                {...componentProps}
            >
                <Tabs
                    tabs={tabs}
                    activeTab={this.state.activeTab}
                    onTabChange={this.handleTabChange}
                />

                {this.state.activeTab === 0 ? (
                    <>
                        <DevicePanel
                            devices={this.state.devices}
                            selectedDeviceIndex={this.state.selectedDeviceIndex}
                            stageSize={stageSize}
                            onSelectDevice={this.handleSelectDevice}
                            onConnect={this.handleDeviceConnect}
                            onDisconnect={this.handleDeviceDisconnect}
                            onUpdateFirmware={this.handleFirmwareUpdate}
                            onUploadProgram={this.handleUploadProgram}
                            onStopProgram={this.handleStopProgram}
                            onEraseProgram={this.handleEraseProgram}
                            onOpenRemote={this.handleOpenRemote}
                            programStatus={this.state.programStatus}
                            onAddDevice={this.handleAddDevice}
                            onRemoveDevice={this.handleRemoveDevice}
                            onLoadExtension={this.props.onLoadExtension}
                        />

                        {/* Modal de extensiones */}
                        {showExtensionModal && (
                            <div className={extensionModalStyles.extensionModalOverlay}>
                                <div className={extensionModalStyles.extensionModal}>
                                    <div className={extensionModalStyles.extensionModalHeader}>
                                        <h2>Seleccionar Extensión</h2>
                                        <button
                                            onClick={this.handleCloseExtensionModal}
                                            className={extensionModalStyles.extensionModalCloseButton}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <div className={extensionModalStyles.extensionList}>
                                        {deviceLibrary.map((extension, index) => (
                                            <button
                                                key={index}
                                                onClick={() => this.handleSelectExtension(extension)}
                                                className={extensionModalStyles.extensionItem}
                                            >
                                                <img
                                                    src={extension.iconURL}
                                                    alt={extension.name}
                                                    className={extensionModalStyles.extensionIcon}
                                                />
                                                <span className={extensionModalStyles.extensionItemName}>
                                                    {extension.name}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Toast: Verificando firmware */}
                        {this.state.firmwareChecking && (
                            <div className={styles.firmwareCheckingToast}>
                                <div className={styles.firmwareCheckingSpinner} />
                                <span className={styles.firmwareCheckingText}>{'Verificando firmware...'}</span>
                            </div>
                        )}

                        {/* Popup: Firmware actualizado */}
                        {this.state.firmwareStatus === 'updated' && (
                            <div className={styles.firmwareStatusOverlay}>
                                <div className={styles.firmwareStatusModal}>
                                    <div className={styles.firmwareStatusIcon}>{'✅'}</div>
                                    <p className={styles.firmwareStatusTitle}>{'¡Firmware actualizado!'}</p>
                                    <p className={styles.firmwareStatusText}>{'Tu dispositivo tiene el firmware más reciente.'}</p>
                                    <button
                                        className={styles.firmwareStatusButton}
                                        onClick={() => this.setState({ firmwareStatus: null })}
                                    >
                                        {'Entendido'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Bloqueante: Firmware desactualizado — no se puede ignorar */}
                        {this.state.firmwareStatus === 'outdated' && (
                            <div className={styles.firmwareBlockingOverlay}>
                                <div className={styles.firmwareStatusModal}>
                                    <div className={styles.firmwareStatusIcon}>{'⚠️'}</div>
                                    <p className={styles.firmwareStatusTitle}>{'Firmware desactualizado'}</p>
                                    <p className={styles.firmwareStatusText}>{'Tu dispositivo necesita una actualización para funcionar. No puedes continuar hasta actualizar.'}</p>
                                    <ol className={styles.firmwareGuideList}>
                                        <li>{'Mantén presionado el botón '}<strong>{'BOOT'}</strong>{' de tu dispositivo'}</li>
                                        <li>{'Haz clic en '}<strong>{'Actualizar firmware'}</strong>{' sin soltar el botón'}</li>
                                        <li>{'Suelta BOOT cuando veas que el progreso avanza'}</li>
                                        <li>{'Espera a que finalice y reconecta tu dispositivo'}</li>
                                    </ol>
                                    <button
                                        className={styles.firmwareStatusButton}
                                        onClick={() => {
                                            this.setState({ firmwareStatus: null });
                                            this.handleFirmwareUpdate();
                                        }}
                                    >
                                        {'Actualizar firmware →'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Control remoto en pantalla */}
                        {this.state.showRemoteModal && (() => {
                            const device = devices[selectedDeviceIndex];
                            const peripheral = device && this.props.vm.runtime.peripheralExtensions &&
                                this.props.vm.runtime.peripheralExtensions[device.extensionId];
                            if (!device || !peripheral) return null;
                            return (
                                <RemoteControlModal
                                    peripheral={peripheral}
                                    deviceName={device.name}
                                    onClose={this.handleCloseRemote}
                                />
                            );
                        })()}

                        {/* Modal de subida del programa compilado (modo autónomo) */}
                        {this.state.showUploadModal && (() => {
                            const device = devices[selectedDeviceIndex];
                            const peripheral = device && this.props.vm.runtime.peripheralExtensions &&
                                this.props.vm.runtime.peripheralExtensions[device.extensionId];
                            if (!device || !peripheral) return null;
                            return (
                                <ProgramUploadModal
                                    vm={this.props.vm}
                                    targetId={this.state.uploadTargetId || device.targetId}
                                    peripheral={peripheral}
                                    deviceName={device.name}
                                    transport={peripheral._activeTransport === peripheral._ble ? 'ble' : 'usb'}
                                    onClose={this.handleCloseUploadModal}
                                />
                            );
                        })()}

                        {/* Modal de Actualización de Firmware */}
                        {this.state.showFirmwareModal && (
                            <FirmwareUpdaterModal
                                port={this.state.activeUpdatingPort}
                                extensionId={devices[selectedDeviceIndex] ? devices[selectedDeviceIndex].extensionId : null}
                                onUpdatingChange={this.handleUpdatingChange}
                                onClose={this.handleCloseFirmwareModal}
                                onReconnect={this.handleReconnect}
                            />
                        )}

                        {/* Loading de reconexión post-firmware */}
                        {this.state.isReconnecting && (
                            <div className={styles.reconnectingOverlay}>
                                <div className={styles.reconnectingBox}>
                                    <div className={styles.reconnectingSpinner} />
                                    <p className={styles.reconnectingText}>{'Reconectando dispositivo...'}</p>
                                </div>
                            </div>
                        )}
                    </>
                ) : this.state.activeTab === 1 ? (
                    <>
                        <SpriteInfo
                            direction={selectedSprite.direction}
                            disabled={spriteInfoDisabled}
                            name={selectedSprite.name}
                            rotationStyle={selectedSprite.rotationStyle}
                            size={selectedSprite.size}
                            stageSize={stageSize}
                            visible={selectedSprite.visible}
                            x={selectedSprite.x}
                            y={selectedSprite.y}
                            onChangeDirection={onChangeSpriteDirection}
                            onChangeName={onChangeSpriteName}
                            onChangeRotationStyle={onChangeSpriteRotationStyle}
                            onChangeSize={onChangeSpriteSize}
                            onChangeVisibility={onChangeSpriteVisibility}
                            onChangeX={onChangeSpriteX}
                            onChangeY={onChangeSpriteY}
                        />

                        <SpriteList
                            editingTarget={editingTarget}
                            hoveredTarget={hoveredTarget}
                            items={Object.keys(sprites).map(id => sprites[id])}
                            raised={raised}
                            selectedId={selectedId}
                            onDeleteSprite={onDeleteSprite}
                            onDrop={onDrop}
                            onDuplicateSprite={onDuplicateSprite}
                            onExportSprite={onExportSprite}
                            onSelectSprite={onSelectSprite}
                        />
                    </>
                ) : (
                    stage && stage.id ? (
                        <div className={styles.fondoWrapper}>
                            <StageSelector
                                asset={stage.costume && stage.costume.asset}
                                backdropCount={stage.costumeCount}
                                id={stage.id}
                                selected={stage.id === editingTarget}
                                onSelect={onSelectSprite}
                            />
                        </div>
                    ) : null
                )}

                {this.state.activeTab === 1 && <ActionMenu
                    className={styles.addButton}
                    img={spriteIcon}
                    moreButtons={[
                        {
                            title: intl.formatMessage(messages.addSpriteFromFile),
                            img: fileUploadIcon,
                            onClick: onFileUploadClick,
                            fileAccept: '.svg, .png, .bmp, .jpg, .jpeg, .sprite2, .sprite3, .gif',
                            fileChange: onSpriteUpload,
                            fileInput: spriteFileInput,
                            fileMultiple: true
                        }, {
                            title: intl.formatMessage(messages.addSpriteFromSurprise),
                            img: surpriseIcon,
                            onClick: onSurpriseSpriteClick
                        }, {
                            title: intl.formatMessage(messages.addSpriteFromPaint),
                            img: paintIcon,
                            onClick: onPaintSpriteClick
                        }, {
                            title: intl.formatMessage(messages.addSpriteFromLibrary),
                            img: searchIcon,
                            onClick: onNewSpriteClick
                        }
                    ]}
                    title={intl.formatMessage(messages.addSpriteFromLibrary)}
                    tooltipPlace={isRtl(intl.locale) ? 'right' : 'left'}
                    onClick={onNewSpriteClick}
                />}
            </Box>
        );
    }
}

SpriteSelectorComponent.propTypes = {
    editingTarget: PropTypes.string,
    hoveredTarget: PropTypes.shape({
        hoveredSprite: PropTypes.string,
        receivedBlocks: PropTypes.bool
    }),
    intl: intlShape.isRequired,
    onChangeSpriteDirection: PropTypes.func,
    onChangeSpriteName: PropTypes.func,
    onChangeSpriteRotationStyle: PropTypes.func,
    onChangeSpriteSize: PropTypes.func,
    onChangeSpriteVisibility: PropTypes.func,
    onChangeSpriteX: PropTypes.func,
    onChangeSpriteY: PropTypes.func,
    onDeleteSprite: PropTypes.func,
    onDeviceConnect: PropTypes.func,
    onDeviceDisconnect: PropTypes.func,
    onDrop: PropTypes.func,
    onDuplicateSprite: PropTypes.func,
    onExportSprite: PropTypes.func,
    onFileUploadClick: PropTypes.func,
    onLoadExtension: PropTypes.func,
    onNewSpriteClick: PropTypes.func,
    onPaintSpriteClick: PropTypes.func,
    onSelectSprite: PropTypes.func,
    onSpriteUpload: PropTypes.func,
    onSurpriseSpriteClick: PropTypes.func,
    raised: PropTypes.bool,
    selectedId: PropTypes.string,
    spriteFileInput: PropTypes.func,
    sprites: PropTypes.shape({
        id: PropTypes.shape({
            costume: PropTypes.shape({
                url: PropTypes.string,
                name: PropTypes.string.isRequired,
                bitmapResolution: PropTypes.number.isRequired,
                rotationCenterX: PropTypes.number.isRequired,
                rotationCenterY: PropTypes.number.isRequired
            }),
            name: PropTypes.string.isRequired,
            order: PropTypes.number.isRequired
        })
    }),
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired
};

export default injectIntl(SpriteSelectorComponent);