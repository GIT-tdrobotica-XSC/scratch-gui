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
        const FIELD_WIDTH = 80;

        function FieldRGBMatrix (value) {
            SB.Field.call(this, value || DEFAULT_VALUE);
        }
        FieldRGBMatrix.prototype = Object.create(SB.Field.prototype);
        FieldRGBMatrix.prototype.constructor = FieldRGBMatrix;
        FieldRGBMatrix.prototype.EDITABLE = true;

        FieldRGBMatrix.fromJson = function (opt) {
            return new FieldRGBMatrix(opt.rgb_matrix || opt.value);
        };

        FieldRGBMatrix.prototype.init = function () {
            if (this.fieldGroup_) return;
            SB.Field.prototype.init.call(this);
            if (this.textElement_) {
                this.textElement_.style.display = 'none';
            }
            this.size_.width = FIELD_WIDTH;
            // Asegurar que el grupo SVG recibe eventos de mouse
            this.fieldGroup_.setAttribute('pointer-events', 'all');
            this.fieldGroup_.style.cursor = 'pointer';
            this.circles_ = [];
            const svgNS = 'http://www.w3.org/2000/svg';
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
            SB.Field.prototype.setValue.call(this, newValue);
            this.updateDisplay_();
        };

        FieldRGBMatrix.prototype.getText = function () { return ''; };
        FieldRGBMatrix.prototype.getText_ = function () { return ''; };

        // Sobrescribir onMouseDown_ para evitar que el sistema de gestos
        // de scratch-blocks intercepte el click antes de llegar a showEditor_
        FieldRGBMatrix.prototype.onMouseDown_ = function (e) {
            if (e) {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
            this.showEditor_();
        };

        FieldRGBMatrix.prototype.showEditor_ = function () {
            // Cerrar popup previo si existe
            const prev = document.getElementById('playcode-rgb-popup');
            if (prev) prev.remove();

            let colors;
            try { colors = JSON.parse(this.getValue()); } catch (e) { colors = [{r:0,g:0,b:0},{r:0,g:0,b:0},{r:0,g:0,b:0}]; }

            const popup = document.createElement('div');
            popup.id = 'playcode-rgb-popup';
            popup.style.cssText = [
                'position:fixed',
                'z-index:99999',
                'background:#1e1e2e',
                'border:1px solid #444',
                'border-radius:10px',
                'box-shadow:0 6px 24px rgba(0,0,0,0.6)',
                'padding:12px 16px 14px',
                'display:flex',
                'gap:14px',
                'align-items:flex-start'
            ].join(';');

            // Posicionar bajo el campo
            let x = 200;
            let y = 200;
            if (this.fieldGroup_) {
                try {
                    const rect = this.fieldGroup_.getBoundingClientRect();
                    x = rect.left;
                    y = rect.bottom + 6;
                    // Evitar salir por la derecha
                    if (x + 200 > window.innerWidth) x = window.innerWidth - 210;
                    // Evitar salir por abajo
                    if (y + 160 > window.innerHeight) y = rect.top - 166;
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

            for (let i = 0; i < 3; i++) {
                const c = colors[i] || {r: 0, g: 0, b: 0};
                const off = c.r === 0 && c.g === 0 && c.b === 0;

                const col = document.createElement('div');
                col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;';

                const preview = document.createElement('div');
                preview.style.cssText = `width:36px;height:36px;border-radius:50%;` +
                    `background:${off ? '#2a2a3a' : `rgb(${c.r},${c.g},${c.b})`};` +
                    `border:2px solid ${off ? '#555' : 'rgba(255,255,255,0.5)'};`;

                const colorIn = document.createElement('input');
                colorIn.type = 'color';
                colorIn.value = off ? '#ff0000' : toHex(c.r, c.g, c.b);
                colorIn.style.cssText = 'width:36px;height:24px;border:1px solid #555;' +
                    'background:#111;padding:1px;cursor:pointer;border-radius:3px;';

                const offBtn = document.createElement('button');
                offBtn.textContent = 'OFF';
                offBtn.style.cssText = `width:36px;font-size:9px;font-weight:bold;padding:2px;` +
                    `border:1px solid ${off ? '#aaa' : '#555'};background:${off ? '#555' : 'transparent'};` +
                    `color:${off ? '#fff' : '#888'};cursor:pointer;border-radius:3px;font-family:sans-serif;`;

                const lbl = document.createElement('div');
                lbl.textContent = `LED ${i}`;
                lbl.style.cssText = 'font-size:10px;color:#aaa;font-family:sans-serif;';

                const set = (r, g, b) => {
                    colors[i] = {r, g, b};
                    const o = r === 0 && g === 0 && b === 0;
                    preview.style.background = o ? '#2a2a3a' : `rgb(${r},${g},${b})`;
                    preview.style.borderColor = o ? '#555' : 'rgba(255,255,255,0.5)';
                    offBtn.style.background = o ? '#555' : 'transparent';
                    offBtn.style.borderColor = o ? '#aaa' : '#555';
                    offBtn.style.color = o ? '#fff' : '#888';
                    this.setValue(JSON.stringify(colors));
                };

                colorIn.addEventListener('input', () => {
                    const rgb = fromHex(colorIn.value);
                    set(rgb.r, rgb.g, rgb.b);
                });
                offBtn.addEventListener('mousedown', e => {
                    e.stopPropagation();
                    set(0, 0, 0);
                });

                col.appendChild(preview);
                col.appendChild(colorIn);
                col.appendChild(offBtn);
                col.appendChild(lbl);
                popup.appendChild(col);
            }

            document.body.appendChild(popup);

            // Cerrar al hacer click fuera
            const closeHandler = e => {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('mousedown', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('mousedown', closeHandler), 100);
        };

        SB.Field.register('field_rgb_matrix', FieldRGBMatrix);

        SB.Blocks['rgb_matrix'] = {
            init: function () {
                this.appendDummyInput()
                    .appendField(new FieldRGBMatrix(DEFAULT_VALUE), 'RGB_MATRIX');
                this.setOutputShape(SB.OUTPUT_SHAPE_ROUND);
            }
        };
    }(ScratchBlocks));

    return ScratchBlocks;
}
