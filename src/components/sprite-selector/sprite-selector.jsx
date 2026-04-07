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
import StageSelector from '../../containers/stage-selector.jsx';
import { STAGE_DISPLAY_SIZES } from '../../lib/layout-constants';
import { isRtl } from 'scratch-l10n';
import extensionLibrary from '../../lib/libraries/extensions';
import playiot from '../../lib/libraries/extensions/playiot';
import extensionModalStyles from './extension-modal.css';

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
            activeTab: 0,
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
            firmwareStatus: null  // null | 'updated' | 'outdated'
        };
        this.connectionCheckInterval = null;
        this._rxCheckTimers = {};
    }

    componentDidMount() {
        // Establecer PlayIoT como dispositivo por defecto (Global tracker init)
        window.activeDeviceExtensionId = 'playiot';
        window.activeDeviceIds = new Set(['playiot']);

        // Cargar la extensión PlayIoT por defecto
        if (this.props.onLoadExtension) {
            this.props.onLoadExtension('playiot');
        }

        // Actualizar estado cada 500ms
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

                // Detectar transición desconectado → conectado para check de RX
                if (!device.isConnected && isConnected && !this._rxCheckTimers[extensionId]) {
                    this._rxCheckTimers[extensionId] = setTimeout(() => {
                        this.checkRxStatus(extensionId);
                        delete this._rxCheckTimers[extensionId];
                    }, 7000);
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
    }

    checkRxStatus = (extensionId) => {
        const { devices } = this.state;
        const { vm } = this.props;
        const device = devices.find(d => d.extensionId === extensionId);
        if (!device || !device.isConnected) return;

        const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions[extensionId];
        if (!peripheral) return;

        // Verificar si el serial recibió datos JSON válidos (seteado en handleIncoming)
        const lastRx = peripheral._serial && peripheral._serial._lastRxTime;
        const hasRx = !!(lastRx && (Date.now() - lastRx) < 12000);

        if (hasRx) {
            this.setState({ firmwareStatus: 'updated' });
            setTimeout(() => this.setState({ firmwareStatus: null }), 10000);
        } else {
            this.setState({ firmwareStatus: 'outdated' });
        }
    }

    handleTabChange = (tabIndex) => {
        this.setState({ activeTab: tabIndex });
        const { onSelectSprite, selectedId, stage, sprites } = this.props;

        if (tabIndex === 0) {
            // Dispositivos: no cambia el target, solo refresca el toolbox al dispositivo activo
            const { selectedDeviceIndex, devices } = this.state;
            const device = devices[selectedDeviceIndex];
            if (device) {
                window.activeDeviceExtensionId = device.extensionId;
                window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {
                    detail: { extensionId: device.extensionId }
                }));
            }
        } else if (tabIndex === 1) {
            // Objetos: si el target actual es el escenario, auto-seleccionar el primer sprite
            if (!onSelectSprite) return;
            const isOnStage = stage && selectedId === stage.id;
            if (isOnStage || !selectedId) {
                const spriteList = Object.values(sprites || {})
                    .sort((a, b) => (a.order || 0) - (b.order || 0));
                if (spriteList.length > 0 && spriteList[0].id) {
                    onSelectSprite(spriteList[0].id);
                }
            } else {
                onSelectSprite(selectedId);
            }
        } else if (tabIndex === 2 && stage && stage.id) {
            // Fondo: mostrar código del escenario
            if (onSelectSprite) onSelectSprite(stage.id);
        }
    }

    handleSelectDevice = (index) => {
        this.setState({ selectedDeviceIndex: index });
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
            });
        } else {
            // Si no existe, créalo
            const newDevice = {
                id: `${extension.extensionId}_${Date.now()}`,
                name: extension.name,
                icon: extension.insetIconURL,
                isConnected: false,
                port: null,
                baudRate: 115200,
                extensionId: extension.extensionId
            };

            this.setState(prevState => ({
                devices: [...prevState.devices, newDevice],
                selectedDeviceIndex: prevState.devices.length,
                showExtensionModal: false
            }));
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

        // Si el dispositivo está conectado, desconectarlo antes de eliminarlo
        if (deviceToRemove && deviceToRemove.isConnected && this.props.onDeviceDisconnect) {
            this.props.onDeviceDisconnect(deviceToRemove.extensionId);
        }

        const newDevices = this.state.devices.filter((_, i) => i !== index);
        const newSelectedIndex = Math.max(0, index - 1);

        this.setState({
            devices: newDevices,
            selectedDeviceIndex: newSelectedIndex
        });

        // Quitar del set de dispositivos permitidos
        if (window.activeDeviceIds instanceof Set) {
            window.activeDeviceIds.delete(deviceToRemove.extensionId);
        }

        // Update active tracker to the newly selected device after removal
        if (newDevices.length > 0) {
            window.activeDeviceExtensionId = newDevices[newSelectedIndex].extensionId;
        } else {
            window.activeDeviceExtensionId = null;
        }

        // Force toolbox refresh and scroll to extension
        window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {
            detail: {
                extensionId: newDevices.length > 0 ? newDevices[newSelectedIndex].extensionId : null
            }
        }));
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

    handleFirmwareUpdate = async () => {
        const { selectedDeviceIndex, devices } = this.state;
        const { vm } = this.props;
        const device = devices[selectedDeviceIndex];

        if (!device) return;

        console.log('Update firmware for:', device);

        const peripheral = vm.runtime.peripheralExtensions && vm.runtime.peripheralExtensions[device.extensionId];

        if (peripheral && peripheral.getSerialPort && peripheral.getSerialPort()) {
            const port = peripheral.getSerialPort();
            // 🔓 Liberar streams pero mantener puerto abierto para esptool-js
            if (peripheral._serial) await peripheral._serial.releasePort();

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

        // 🔐 Intentar reclamar el puerto si existía uno previo
        if (device && activeUpdatingPort) {
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
                                        {extensionLibrary.map((extension, index) => (
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

                        {/* Popup: Firmware desactualizado */}
                        {this.state.firmwareStatus === 'outdated' && (
                            <div className={styles.firmwareStatusOverlay}>
                                <div className={styles.firmwareStatusModal}>
                                    <div className={styles.firmwareStatusIcon}>{'⚠️'}</div>
                                    <p className={styles.firmwareStatusTitle}>{'Firmware desactualizado'}</p>
                                    <p className={styles.firmwareStatusText}>{'Tu dispositivo no está enviando datos. Es posible que necesite una actualización de firmware.'}</p>
                                    <button
                                        className={styles.firmwareStatusButton}
                                        onClick={() => {
                                            this.setState({ firmwareStatus: null });
                                            this.handleFirmwareUpdate();
                                        }}
                                    >
                                        {'Actualizar firmware →'}
                                    </button>
                                    <button
                                        className={styles.firmwareStatusButtonSecondary}
                                        onClick={() => this.setState({ firmwareStatus: null })}
                                    >
                                        {'Ignorar'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Modal de Actualización de Firmware */}
                        {this.state.showFirmwareModal && (
                            <FirmwareUpdaterModal
                                port={this.state.activeUpdatingPort}
                                extensionId={devices[selectedDeviceIndex] ? devices[selectedDeviceIndex].extensionId : null}
                                onUpdatingChange={this.handleUpdatingChange}
                                onClose={this.handleCloseFirmwareModal}
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