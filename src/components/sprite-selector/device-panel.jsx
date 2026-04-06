import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import styles from './device-panel.css';

class DevicePanel extends React.Component {
    handleSelectDevice = (index) => {
        this.props.onSelectDevice(index);

        const device = this.props.devices[index];
        if (device) {
            // Set global tracker for toolbox filtering
            window.activeDeviceExtensionId = device.extensionId;

            // Load the correct extension
            if (this.props.onLoadExtension) {
                this.props.onLoadExtension(device.extensionId);
            }

            // Force toolbox refresh and scroll to extension
            window.dispatchEvent(new CustomEvent('scratch_toolbox_refresh_requested', {
                detail: { extensionId: device.extensionId }
            }));
        }
    }

    render() {
        const {
            devices,
            selectedDeviceIndex,
            stageSize,
            onConnect,
            onDisconnect,
            onUpdateFirmware,
            onAddDevice,
            onRemoveDevice
        } = this.props;

        const selectedDevice = devices && devices[selectedDeviceIndex] ? devices[selectedDeviceIndex] : null;
        const isSmall = stageSize === 'small';

        return (
            <div className={classNames(styles.devicePanelWrapper, {
                [styles.devicePanelWrapperSmall]: isSmall
            })}>
                {/* Panel izquierdo - Lista de dispositivos (Flexible) */}
                <div className={classNames(styles.deviceListPanel, {
                    [styles.deviceListPanelSmall]: isSmall
                })}>
                    <div className={styles.deviceListHeader}>
                        <h3 className={styles.deviceListTitle}>
                            Dispositivos
                        </h3>
                    </div>

                    <div className={styles.deviceList}>
                        {devices && devices.length > 0 ? (
                            devices.map((device, index) => (
                                <div
                                    key={device.id}
                                    className={styles.deviceListItemWrapper}
                                >
                                    <button
                                        className={classNames(styles.deviceListItem, {
                                            [styles.deviceListItemActive]: selectedDeviceIndex === index
                                        })}
                                        onClick={() => this.handleSelectDevice(index)}
                                    >
                                        <div className={styles.deviceListItemContent}>
                                            {device.icon && (
                                                <img
                                                    className={styles.deviceListItemIcon}
                                                    src={device.icon}
                                                    draggable={false}
                                                />
                                            )}
                                            <span className={styles.deviceListItemName}>
                                                {device.name}
                                            </span>
                                        </div>
                                        <span
                                            className={styles.deviceListItemStatus}
                                            style={{
                                                backgroundColor: device.isConnected ? '#51C141' : '#FF6B6B'
                                            }}
                                        />
                                    </button>
                                    <button
                                        className={styles.deviceListItemDelete}
                                        title="Eliminar dispositivo"
                                        onClick={e => { e.stopPropagation(); onRemoveDevice(index); }}
                                    >
                                        {'×'}
                                    </button>
                                </div>
                            ))
                        ) : null}
                    </div>

                    <button
                        className={styles.addDeviceButtonList}
                        onClick={onAddDevice}
                    >
                        + Añadir Dispositivo
                    </button>
                </div>

                {/* Panel derecho - Detalles del dispositivo (70%) */}
                <div className={styles.deviceDetailsPanel}>
                    {selectedDevice ? (
                        <div className={styles.deviceDetails}>
                            <div className={styles.detailsHeader}>
                                <h2 className={styles.detailsTitle}>
                                    {selectedDevice.name}
                                </h2>
                            </div>

                            <div className={styles.detailsInfo}>
                                <div className={styles.infoSection}>
                                    <h3 className={styles.infoSectionTitle}>
                                        Conexión
                                    </h3>

                                    <div className={styles.infoRow}>
                                        <span className={styles.infoLabel}>
                                            Estado
                                        </span>
                                        <span className={styles.infoValue}>
                                            <span
                                                className={styles.statusDot}
                                                style={{
                                                    backgroundColor: selectedDevice.isConnected ? '#51C141' : '#FF6B6B'
                                                }}
                                            />
                                            {selectedDevice.isConnected ? 'Conectado' : 'Desconectado'}
                                        </span>
                                    </div>

                                    <div className={styles.infoRow}>
                                        <span className={styles.infoLabel}>
                                            Puerto
                                        </span>
                                        <span className={styles.infoValue}>
                                            {selectedDevice.port || 'Sin puerto seleccionado'}
                                        </span>
                                    </div>

                                </div>

                                <div className={styles.buttonGroup}>
                                    {!selectedDevice.isConnected ? (
                                        <button
                                            className={classNames(styles.button, styles.connectButton)}
                                            onClick={onConnect}
                                        >
                                            Conectar
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                className={classNames(styles.button, styles.disconnectButton)}
                                                onClick={onDisconnect}
                                            >
                                                Desconectar
                                            </button>

                                            <button
                                                className={classNames(styles.button, styles.firmwareButton)}
                                                onClick={onUpdateFirmware}
                                            >
                                                Actualizar Firmware
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <span className={styles.emptyStateIcon}>{'🔌'}</span>
                            <p className={styles.emptyStateTitle}>{'Sin dispositivos'}</p>
                            <p className={styles.emptyStateText}>{'Agrega un dispositivo para comenzar'}</p>
                            <button
                                className={styles.emptyStateAddButton}
                                onClick={onAddDevice}
                            >
                                {'+ Añadir dispositivo'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

DevicePanel.propTypes = {
    devices: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        icon: PropTypes.string,
        isConnected: PropTypes.bool,
        port: PropTypes.string,
        baudRate: PropTypes.number
    })),
    selectedDeviceIndex: PropTypes.number,
    onSelectDevice: PropTypes.func,
    onConnect: PropTypes.func,
    onDisconnect: PropTypes.func,
    onUpdateFirmware: PropTypes.func,
    onAddDevice: PropTypes.func,
    onRemoveDevice: PropTypes.func,
    onLoadExtension: PropTypes.func,
    stageSize: PropTypes.string
};

DevicePanel.defaultProps = {
    devices: [],
    selectedDeviceIndex: 0,
    onSelectDevice: () => { },
    onConnect: () => { },
    onDisconnect: () => { },
    onUpdateFirmware: () => { },
    onAddDevice: () => { },
    onRemoveDevice: () => { },
    onLoadExtension: () => { }
};

export default DevicePanel;