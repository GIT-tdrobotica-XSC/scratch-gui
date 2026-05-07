/**
 * Connect scratch blocks with the vm
 * @param {VirtualMachine} vm - The scratch vm
 * @param {Bool} useCatBlocks - Whether to use cat blocks rendering of ScratchBlocks
 * @return {ScratchBlocks} ScratchBlocks connected with the vm
 */
export default function (vm, useCatBlocks) {
    const ScratchBlocks = useCatBlocks ? require('cat-blocks') : require('scratch-blocks');
    const jsonForMenuBlock = function (name, menuOptionsFn, colors, start) {
        return {
            message0: '%1',
            args0: [
                {
                    type: 'field_dropdown',
                    name: name,
                    options: function () {
                        return start.concat(menuOptionsFn());
                    }
                }
            ],
            inputsInline: true,
            output: 'String',
            colour: colors.secondary,
            colourSecondary: colors.secondary,
            colourTertiary: colors.tertiary,
            colourQuaternary: colors.quaternary,
            outputShape: ScratchBlocks.OUTPUT_SHAPE_ROUND
        };
    };

    const jsonForHatBlockMenu = function (hatName, name, menuOptionsFn, colors, start) {
        return {
            message0: hatName,
            args0: [
                {
                    type: 'field_dropdown',
                    name: name,
                    options: function () {
                        return start.concat(menuOptionsFn());
                    }
                }
            ],
            colour: colors.primary,
            colourSecondary: colors.secondary,
            colourTertiary: colors.tertiary,
            colourQuaternary: colors.quaternary,
            extensions: ['shape_hat']
        };
    };


    const jsonForSensingMenus = function (menuOptionsFn) {
        return {
            message0: ScratchBlocks.Msg.SENSING_OF,
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PROPERTY',
                    options: function () {
                        return menuOptionsFn();
                    }

                },
                {
                    type: 'input_value',
                    name: 'OBJECT'
                }
            ],
            output: true,
            colour: ScratchBlocks.Colours.sensing.primary,
            colourSecondary: ScratchBlocks.Colours.sensing.secondary,
            colourTertiary: ScratchBlocks.Colours.sensing.tertiary,
            colourQuaternary: ScratchBlocks.Colours.sensing.quaternary,
            outputShape: ScratchBlocks.OUTPUT_SHAPE_ROUND
        };
    };

    const soundsMenu = function () {
        let menu = [['', '']];
        if (vm.editingTarget && vm.editingTarget.sprite.sounds.length > 0) {
            menu = vm.editingTarget.sprite.sounds.map(sound => [sound.name, sound.name]);
        }
        menu.push([
            ScratchBlocks.ScratchMsgs.translate('SOUND_RECORD', 'record...'),
            ScratchBlocks.recordSoundCallback
        ]);
        return menu;
    };

    const costumesMenu = function () {
        if (vm.editingTarget && vm.editingTarget.getCostumes().length > 0) {
            return vm.editingTarget.getCostumes().map(costume => [costume.name, costume.name]);
        }
        return [['', '']];
    };

    const backdropsMenu = function () {
        const next = ScratchBlocks.ScratchMsgs.translate('LOOKS_NEXTBACKDROP', 'next backdrop');
        const previous = ScratchBlocks.ScratchMsgs.translate('LOOKS_PREVIOUSBACKDROP', 'previous backdrop');
        const random = ScratchBlocks.ScratchMsgs.translate('LOOKS_RANDOMBACKDROP', 'random backdrop');
        if (vm.runtime.targets[0] && vm.runtime.targets[0].getCostumes().length > 0) {
            return vm.runtime.targets[0].getCostumes().map(costume => [costume.name, costume.name])
                .concat([[next, 'next backdrop'],
                    [previous, 'previous backdrop'],
                    [random, 'random backdrop']]);
        }
        return [['', '']];
    };

    const backdropNamesMenu = function () {
        const stage = vm.runtime.getTargetForStage();
        if (stage && stage.getCostumes().length > 0) {
            return stage.getCostumes().map(costume => [costume.name, costume.name]);
        }
        return [['', '']];
    };

    const spriteMenu = function () {
        const sprites = [];
        for (const targetId in vm.runtime.targets) {
            if (!Object.prototype.hasOwnProperty.call(vm.runtime.targets, targetId)) continue;
            if (vm.runtime.targets[targetId].isOriginal) {
                if (!vm.runtime.targets[targetId].isStage) {
                    if (vm.runtime.targets[targetId] === vm.editingTarget) {
                        continue;
                    }
                    sprites.push([vm.runtime.targets[targetId].sprite.name, vm.runtime.targets[targetId].sprite.name]);
                }
            }
        }
        return sprites;
    };

    const cloneMenu = function () {
        if (vm.editingTarget && vm.editingTarget.isStage) {
            const menu = spriteMenu();
            if (menu.length === 0) {
                return [['', '']]; // Empty menu matches Scratch 2 behavior
            }
            return menu;
        }
        const myself = ScratchBlocks.ScratchMsgs.translate('CONTROL_CREATECLONEOF_MYSELF', 'myself');
        return [[myself, '_myself_']].concat(spriteMenu());
    };

    const soundColors = ScratchBlocks.Colours.sounds;

    const looksColors = ScratchBlocks.Colours.looks;

    const motionColors = ScratchBlocks.Colours.motion;

    const sensingColors = ScratchBlocks.Colours.sensing;

    const controlColors = ScratchBlocks.Colours.control;

    const eventColors = ScratchBlocks.Colours.event;

    ScratchBlocks.Blocks.sound_sounds_menu.init = function () {
        const json = jsonForMenuBlock('SOUND_MENU', soundsMenu, soundColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.looks_costume.init = function () {
        const json = jsonForMenuBlock('COSTUME', costumesMenu, looksColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.looks_backdrops.init = function () {
        const json = jsonForMenuBlock('BACKDROP', backdropsMenu, looksColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.event_whenbackdropswitchesto.init = function () {
        const json = jsonForHatBlockMenu(
            ScratchBlocks.Msg.EVENT_WHENBACKDROPSWITCHESTO,
            'BACKDROP', backdropNamesMenu, eventColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.motion_pointtowards_menu.init = function () {
        const mouse = ScratchBlocks.ScratchMsgs.translate('MOTION_POINTTOWARDS_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TOWARDS', spriteMenu, motionColors, [
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.motion_goto_menu.init = function () {
        const random = ScratchBlocks.ScratchMsgs.translate('MOTION_GOTO_RANDOM', 'random position');
        const mouse = ScratchBlocks.ScratchMsgs.translate('MOTION_GOTO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TO', spriteMenu, motionColors, [
            [random, '_random_'],
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.motion_glideto_menu.init = function () {
        const random = ScratchBlocks.ScratchMsgs.translate('MOTION_GLIDETO_RANDOM', 'random position');
        const mouse = ScratchBlocks.ScratchMsgs.translate('MOTION_GLIDETO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('TO', spriteMenu, motionColors, [
            [random, '_random_'],
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_of_object_menu.init = function () {
        const stage = ScratchBlocks.ScratchMsgs.translate('SENSING_OF_STAGE', 'Stage');
        const json = jsonForMenuBlock('OBJECT', spriteMenu, sensingColors, [
            [stage, '_stage_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_of.init = function () {
        const blockId = this.id;
        const blockType = this.type;

        // Get the sensing_of block from vm.
        let defaultSensingOfBlock;
        const blocks = vm.runtime.flyoutBlocks._blocks;
        Object.keys(blocks).forEach(id => {
            const block = blocks[id];
            if (id === blockType || (block && block.opcode === blockType)) {
                defaultSensingOfBlock = block;
            }
        });

        // Function that fills in menu for the first input in the sensing block.
        // Called every time it opens since it depends on the values in the other block input.
        const menuFn = function () {
            const stageOptions = [
                [ScratchBlocks.Msg.SENSING_OF_BACKDROPNUMBER, 'backdrop #'],
                [ScratchBlocks.Msg.SENSING_OF_BACKDROPNAME, 'backdrop name'],
                [ScratchBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            const spriteOptions = [
                [ScratchBlocks.Msg.SENSING_OF_XPOSITION, 'x position'],
                [ScratchBlocks.Msg.SENSING_OF_YPOSITION, 'y position'],
                [ScratchBlocks.Msg.SENSING_OF_DIRECTION, 'direction'],
                [ScratchBlocks.Msg.SENSING_OF_COSTUMENUMBER, 'costume #'],
                [ScratchBlocks.Msg.SENSING_OF_COSTUMENAME, 'costume name'],
                [ScratchBlocks.Msg.SENSING_OF_SIZE, 'size'],
                [ScratchBlocks.Msg.SENSING_OF_VOLUME, 'volume']
            ];
            if (vm.editingTarget) {
                let lookupBlocks = vm.editingTarget.blocks;
                let sensingOfBlock = lookupBlocks.getBlock(blockId);

                // The block doesn't exist, but should be in the flyout. Look there.
                if (!sensingOfBlock) {
                    sensingOfBlock = vm.runtime.flyoutBlocks.getBlock(blockId) || defaultSensingOfBlock;
                    // If we still don't have a block, just return an empty list . This happens during
                    // scratch blocks construction.
                    if (!sensingOfBlock) {
                        return [['', '']];
                    }
                    // The block was in the flyout so look up future block info there.
                    lookupBlocks = vm.runtime.flyoutBlocks;
                }
                const sort = function (options) {
                    options.sort(ScratchBlocks.scratchBlocksUtils.compareStrings);
                };
                // Get all the stage variables (no lists) so we can add them to menu when the stage is selected.
                const stageVariableOptions = vm.runtime.getTargetForStage().getAllVariableNamesInScopeByType('');
                sort(stageVariableOptions);
                const stageVariableMenuItems = stageVariableOptions.map(variable => [variable, variable]);
                if (sensingOfBlock.inputs.OBJECT.shadow !== sensingOfBlock.inputs.OBJECT.block) {
                    // There's a block dropped on top of the menu. It'd be nice to evaluate it and
                    // return the correct list, but that is tricky. Scratch2 just returns stage options
                    // so just do that here too.
                    return stageOptions.concat(stageVariableMenuItems);
                }
                const menuBlock = lookupBlocks.getBlock(sensingOfBlock.inputs.OBJECT.shadow);
                const selectedItem = menuBlock.fields.OBJECT.value;
                if (selectedItem === '_stage_') {
                    return stageOptions.concat(stageVariableMenuItems);
                }
                // Get all the local variables (no lists) and add them to the menu.
                const target = vm.runtime.getSpriteTargetByName(selectedItem);
                let spriteVariableOptions = [];
                // The target should exist, but there are ways for it not to (e.g. #4203).
                if (target) {
                    spriteVariableOptions = target.getAllVariableNamesInScopeByType('', true);
                    sort(spriteVariableOptions);
                }
                const spriteVariableMenuItems = spriteVariableOptions.map(variable => [variable, variable]);
                return spriteOptions.concat(spriteVariableMenuItems);
            }
            return [['', '']];
        };

        const json = jsonForSensingMenus(menuFn);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_distancetomenu.init = function () {
        const mouse = ScratchBlocks.ScratchMsgs.translate('SENSING_DISTANCETO_POINTER', 'mouse-pointer');
        const json = jsonForMenuBlock('DISTANCETOMENU', spriteMenu, sensingColors, [
            [mouse, '_mouse_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.sensing_touchingobjectmenu.init = function () {
        const mouse = ScratchBlocks.ScratchMsgs.translate('SENSING_TOUCHINGOBJECT_POINTER', 'mouse-pointer');
        const edge = ScratchBlocks.ScratchMsgs.translate('SENSING_TOUCHINGOBJECT_EDGE', 'edge');
        const json = jsonForMenuBlock('TOUCHINGOBJECTMENU', spriteMenu, sensingColors, [
            [mouse, '_mouse_'],
            [edge, '_edge_']
        ]);
        this.jsonInit(json);
    };

    ScratchBlocks.Blocks.control_create_clone_of_menu.init = function () {
        const json = jsonForMenuBlock('CLONE_OPTION', cloneMenu, controlColors, []);
        this.jsonInit(json);
    };

    ScratchBlocks.VerticalFlyout.getCheckboxState = function (blockId) {
        const monitoredBlock = vm.runtime.monitorBlocks._blocks[blockId];
        return monitoredBlock ? monitoredBlock.isMonitored : false;
    };

    ScratchBlocks.FlyoutExtensionCategoryHeader.getExtensionState = function (extensionId) {
        if (vm.getPeripheralIsConnected(extensionId)) {
            return ScratchBlocks.StatusButtonState.READY;
        }
        return ScratchBlocks.StatusButtonState.NOT_READY;
    };

    ScratchBlocks.FieldNote.playNote_ = function (noteNum, extensionId) {
        vm.runtime.emit('PLAY_NOTE', noteNum, extensionId);
    };

    // Use a collator's compare instead of localeCompare which internally
    // creates a collator. Using this is a lot faster in browsers that create a
    // collator for every localeCompare call.
    const collator = new Intl.Collator([], {
        sensitivity: 'base',
        numeric: true
    });
    ScratchBlocks.scratchBlocksUtils.compareStrings = function (str1, str2) {
        return collator.compare(str1, str2);
    };

    // Blocks wants to know if 3D CSS transforms are supported. The cross
    // section of browsers Scratch supports and browsers that support 3D CSS
    // transforms will make the return always true.
    //
    // Shortcutting to true lets us skip an expensive style recalculation when
    // first loading the Scratch editor.
    ScratchBlocks.utils.is3dSupported = function () {
        return true;
    };

    // ===== Campo RGB Matrix: widget visual para 3 LEDs =====
    (function registerFieldRGBMatrix (SB) {
        const DEFAULT_VALUE = JSON.stringify([{r: 0, g: 0, b: 0}, {r: 0, g: 0, b: 0}, {r: 0, g: 0, b: 0}]);
        const FIELD_W = 80;
        const FIELD_H = 26;

        function FieldRGBMatrix (value) {
            SB.Field.call(this, null);
            this.value_ = value || DEFAULT_VALUE;
        }
        FieldRGBMatrix.prototype = Object.create(SB.Field.prototype);
        FieldRGBMatrix.prototype.constructor = FieldRGBMatrix;
        FieldRGBMatrix.prototype.EDITABLE = true;

        FieldRGBMatrix.fromJson = function (opt) {
            return new FieldRGBMatrix(opt.rgb_matrix || opt.value);
        };

        // render_() siempre devuelve nuestro tamaño fijo para evitar que Blockly
        // recalcule el ancho del campo en base al texto del JSON
        FieldRGBMatrix.prototype.render_ = function () {
            this.size_.width = FIELD_W;
            this.size_.height = FIELD_H;
        };

        FieldRGBMatrix.prototype.init = function () {
            if (this.fieldGroup_) return;

            const svgNS = 'http://www.w3.org/2000/svg';
            this.fieldGroup_ = document.createElementNS(svgNS, 'g');
            this.fieldGroup_.setAttribute('class', 'blocklyEditableText');
            this.fieldGroup_.setAttribute('pointer-events', 'all');
            this.fieldGroup_.style.cursor = 'pointer';
            this.size_ = {width: FIELD_W, height: FIELD_H};

            // Fondo del campo
            const bg = document.createElementNS(svgNS, 'rect');
            bg.setAttribute('rx', '4');
            bg.setAttribute('ry', '4');
            bg.setAttribute('width', FIELD_W);
            bg.setAttribute('height', FIELD_H);
            bg.setAttribute('fill', 'rgba(0,0,0,0.2)');
            this.fieldGroup_.appendChild(bg);

            // 3 círculos LED
            this.circles_ = [];
            for (let i = 0; i < 3; i++) {
                const circle = document.createElementNS(svgNS, 'circle');
                circle.setAttribute('cx', 14 + i * 24);
                circle.setAttribute('cy', 13);
                circle.setAttribute('r', 9);
                circle.setAttribute('stroke-width', '1.5');
                this.fieldGroup_.appendChild(circle);
                this.circles_.push(circle);

                const lbl = document.createElementNS(svgNS, 'text');
                lbl.setAttribute('x', 14 + i * 24);
                lbl.setAttribute('y', 17);
                lbl.setAttribute('text-anchor', 'middle');
                lbl.setAttribute('font-size', '8');
                lbl.setAttribute('fill', 'rgba(255,255,255,0.5)');
                lbl.setAttribute('pointer-events', 'none');
                lbl.textContent = i;
                this.fieldGroup_.appendChild(lbl);
            }

            this.updateDisplay_();

            // Añadir al bloque
            if (this.sourceBlock_ && this.sourceBlock_.getSvgRoot) {
                this.sourceBlock_.getSvgRoot().appendChild(this.fieldGroup_);
            }

            // Listener en fase de CAPTURA: se ejecuta antes que cualquier handler de Blockly
            this.fieldGroup_.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.showEditor_();
            }, true);

            // Forzar re-render del bloque para que tome nuestro tamaño correcto
            if (this.sourceBlock_ && this.sourceBlock_.rendered) {
                this.sourceBlock_.render();
            }
        };

        FieldRGBMatrix.prototype.updateDisplay_ = function () {
            if (!this.circles_) return;
            try {
                const colors = JSON.parse(this.value_ || DEFAULT_VALUE);
                for (let i = 0; i < 3; i++) {
                    const c = colors[i] || {r: 0, g: 0, b: 0};
                    const off = c.r === 0 && c.g === 0 && c.b === 0;
                    this.circles_[i].setAttribute('fill', off ? '#2a2a3a' : `rgb(${c.r},${c.g},${c.b})`);
                    this.circles_[i].setAttribute('stroke', off ? '#555' : 'rgba(255,255,255,0.5)');
                }
            } catch (e) { /* noop */ }
        };

        FieldRGBMatrix.prototype.getValue = function () {
            return this.value_ || DEFAULT_VALUE;
        };

        FieldRGBMatrix.prototype.setValue = function (newValue) {
            if (!newValue || newValue === this.value_) return;
            const oldValue = this.value_;
            this.value_ = newValue;
            this.updateDisplay_();
            // Disparar BlockChange para que scratch-vm actualice su representación interna
            if (this.sourceBlock_ && SB.Events &&
                typeof SB.Events.isEnabled === 'function' && SB.Events.isEnabled()) {
                SB.Events.fire(new SB.Events.BlockChange(
                    this.sourceBlock_, 'field', this.name, oldValue, newValue
                ));
            }
        };

        FieldRGBMatrix.prototype.getText = function () { return ''; };
        FieldRGBMatrix.prototype.getText_ = function () { return ''; };
        FieldRGBMatrix.prototype.onMouseDown_ = function (e) {
            if (e) { e.stopPropagation(); e.stopImmediatePropagation(); }
            this.showEditor_();
        };

        FieldRGBMatrix.prototype.showEditor_ = function () {
            const prev = document.getElementById('playcode-rgb-popup');
            if (prev) prev.remove();

            let colors;
            try { colors = JSON.parse(this.getValue()); } catch (e) { colors = [{r:0,g:0,b:0},{r:0,g:0,b:0},{r:0,g:0,b:0}]; }

            const popup = document.createElement('div');
            popup.id = 'playcode-rgb-popup';
            popup.style.cssText = [
                'position:fixed',
                'z-index:99999',
                'background:linear-gradient(160deg, #232331 0%, #1a1a25 100%)',
                'border:1px solid rgba(255,255,255,0.08)',
                'border-radius:14px',
                'box-shadow:0 10px 40px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)',
                'padding:14px 16px 16px',
                'display:flex',
                'flex-direction:column',
                'gap:12px',
                'font-family:"Helvetica Neue",Helvetica,Arial,sans-serif'
            ].join(';');

            // Header: título + botón cerrar
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
            const title = document.createElement('span');
            title.textContent = 'LEDs RGB';
            title.style.cssText = 'font-size:11px;color:#9ca3b8;font-weight:700;letter-spacing:1px;text-transform:uppercase;';
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = 'background:none;border:none;color:#7a7a8c;font-size:16px;cursor:pointer;padding:2px 6px;line-height:1;border-radius:4px;transition:all 0.15s ease;';
            closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#fff'; closeBtn.style.background = 'rgba(255,255,255,0.08)'; });
            closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = '#7a7a8c'; closeBtn.style.background = 'none'; });
            closeBtn.addEventListener('mousedown', e => { e.stopPropagation(); popup.remove(); });
            header.appendChild(title);
            header.appendChild(closeBtn);
            popup.appendChild(header);

            // Fila de LEDs
            const ledsRow = document.createElement('div');
            ledsRow.style.cssText = 'display:flex;gap:16px;align-items:flex-start;';

            // Posicionar bajo el campo
            let x = 200;
            let y = 200;
            if (this.fieldGroup_) {
                try {
                    const rect = this.fieldGroup_.getBoundingClientRect();
                    x = rect.left;
                    y = rect.bottom + 8;
                    if (x + 240 > window.innerWidth) x = window.innerWidth - 250;
                    if (y + 180 > window.innerHeight) y = rect.top - 186;
                } catch (e) { /* noop */ }
            }
            popup.style.left = x + 'px';
            popup.style.top = y + 'px';

            const toHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
            const fromHex = h => ({
                r: parseInt(h.slice(1, 3), 16),
                g: parseInt(h.slice(3, 5), 16),
                b: parseInt(h.slice(5, 7), 16)
            });

            // Icono SVG de power
            const powerSvg = (stroke) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                <line x1="12" y1="2" x2="12" y2="12"/>
            </svg>`;

            for (let i = 0; i < 3; i++) {
                const c = colors[i] || {r: 0, g: 0, b: 0};
                const off = c.r === 0 && c.g === 0 && c.b === 0;

                const col = document.createElement('div');
                col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;';

                // Círculo grande clickeable — al click abre el color picker nativo
                const circle = document.createElement('div');
                circle.title = 'Cambiar color';
                circle.style.cssText = 'width:54px;height:54px;border-radius:50%;cursor:pointer;' +
                    'transition:all 0.18s ease;position:relative;display:flex;align-items:center;justify-content:center;';

                // Input color nativo, oculto pero clickeable programáticamente
                const colorIn = document.createElement('input');
                colorIn.type = 'color';
                colorIn.value = off ? '#ff5757' : toHex(c.r, c.g, c.b);
                // No usar display:none — algunos browsers no disparan el picker. Tapado y sin tamaño.
                colorIn.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:none;padding:0;';

                // Label "LED N"
                const lbl = document.createElement('div');
                lbl.textContent = `LED ${i}`;
                lbl.style.cssText = 'font-size:10px;color:#9ca3b8;font-weight:600;letter-spacing:0.4px;';

                // Botón OFF/ON con ícono de power
                const offBtn = document.createElement('button');
                offBtn.title = 'Apagar';
                offBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:5px;' +
                    'width:54px;height:26px;padding:0;border-radius:13px;cursor:pointer;' +
                    'border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);' +
                    'transition:all 0.18s ease;font-family:inherit;';

                const renderState = (r, g, b) => {
                    const o = r === 0 && g === 0 && b === 0;
                    if (o) {
                        // Apagado: círculo oscuro con sombra interna, botón rojo "OFF"
                        circle.style.background = 'radial-gradient(circle at 30% 30%, #3a3a4a, #1f1f2c)';
                        circle.style.border = '2px solid #4a4a5a';
                        circle.style.boxShadow = 'inset 0 2px 6px rgba(0,0,0,0.4)';
                        offBtn.style.background = 'linear-gradient(135deg, #ff5757 0%, #e03e3e 100%)';
                        offBtn.style.borderColor = '#ff5757';
                        offBtn.innerHTML = `${powerSvg('#fff')}<span style="font-size:10px;font-weight:700;letter-spacing:0.5px;color:#fff;">OFF</span>`;
                    } else {
                        // Encendido: círculo brillante con glow del color, botón sutil "ON"
                        const rgbStr = `rgb(${r},${g},${b})`;
                        circle.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), ${rgbStr} 60%, rgba(0,0,0,0.2))`;
                        circle.style.border = `2px solid ${rgbStr}`;
                        circle.style.boxShadow = `0 0 14px ${rgbStr}, inset 0 1px 3px rgba(255,255,255,0.3)`;
                        offBtn.style.background = 'rgba(255,255,255,0.04)';
                        offBtn.style.borderColor = 'rgba(255,255,255,0.1)';
                        offBtn.innerHTML = `${powerSvg('#9ca3b8')}<span style="font-size:10px;font-weight:700;letter-spacing:0.5px;color:#9ca3b8;">ON</span>`;
                    }
                };

                const set = (r, g, b) => {
                    colors[i] = {r, g, b};
                    renderState(r, g, b);
                    this.setValue(JSON.stringify(colors));
                };

                // Hover en círculo: pequeña elevación
                circle.addEventListener('mouseenter', () => { circle.style.transform = 'scale(1.06)'; });
                circle.addEventListener('mouseleave', () => { circle.style.transform = 'scale(1)'; });

                // Click en círculo: dispara el color picker nativo
                circle.addEventListener('mousedown', e => {
                    e.stopPropagation();
                    // Si está apagado, default a último color o rojo
                    if (off) colorIn.value = '#ff5757';
                    colorIn.click();
                });

                colorIn.addEventListener('input', () => {
                    const rgb = fromHex(colorIn.value);
                    set(rgb.r, rgb.g, rgb.b);
                });

                // Botón OFF/ON: si ya está OFF, click no hace nada (es un indicador);
                // si está ON, lo apaga. Si OFF y user quiere ON, debe usar el círculo.
                offBtn.addEventListener('mousedown', e => {
                    e.stopPropagation();
                    const currentColor = colors[i] || {r: 0, g: 0, b: 0};
                    const isOff = currentColor.r === 0 && currentColor.g === 0 && currentColor.b === 0;
                    if (!isOff) {
                        set(0, 0, 0);
                    } else {
                        // Si está OFF y el user clickea OFF, abrir color picker como atajo
                        colorIn.value = '#ff5757';
                        colorIn.click();
                    }
                });

                col.appendChild(circle);
                col.appendChild(colorIn);
                col.appendChild(offBtn);
                col.appendChild(lbl);

                renderState(c.r, c.g, c.b);
                ledsRow.appendChild(col);
            }

            popup.appendChild(ledsRow);

            // Footer: hint
            const hint = document.createElement('div');
            hint.textContent = 'Click en el círculo para cambiar color · Click en el botón para apagar';
            hint.style.cssText = 'font-size:9.5px;color:#6a6a7a;text-align:center;font-style:italic;margin-top:2px;';
            popup.appendChild(hint);

            document.body.appendChild(popup);

            // Cerrar con Escape o click fuera
            const keyHandler = e => {
                if (e.key === 'Escape') {
                    popup.remove();
                    document.removeEventListener('keydown', keyHandler);
                    document.removeEventListener('mousedown', clickHandler);
                }
            };
            const clickHandler = e => {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('mousedown', clickHandler);
                    document.removeEventListener('keydown', keyHandler);
                }
            };
            setTimeout(() => {
                document.addEventListener('mousedown', clickHandler);
                document.addEventListener('keydown', keyHandler);
            }, 150);
        };

        if (SB.Field && SB.Field.register) {
            SB.Field.register('field_rgb_matrix', FieldRGBMatrix);
        }

        SB.Blocks['rgb_matrix'] = {
            init: function () {
                const blockRef = this;
                const field = new FieldRGBMatrix(DEFAULT_VALUE);
                this.appendDummyInput()
                    .appendField(field, 'RGB_MATRIX');
                this.setOutput(true);
                this.setOutputShape(SB.OUTPUT_SHAPE_ROUND);

                // Hookear initSvg_ para forzar field.init() cuando el SVG del bloque esté listo.
                // Blockly no lo llama automáticamente para campos custom en shadow blocks.
                const originalInitSvg_ = this.initSvg_ ? this.initSvg_.bind(this) : null;
                this.initSvg_ = function () {
                    if (originalInitSvg_) originalInitSvg_();
                    if (!field.fieldGroup_) {
                        field.sourceBlock_ = blockRef;
                        field.init();
                    }
                };
            }
        };
    }(ScratchBlocks));

    return ScratchBlocks;
}
