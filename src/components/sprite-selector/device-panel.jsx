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
            onUploadProgram,
            onStopProgram,
            onEraseProgram,
            onOpenRemote,
            programStatus,
            onAddDevice,
            onRemoveDevice
        } = this.props;

        const selectedDevice = devices && devices[selectedDeviceIndex] ? devices[selectedDeviceIndex] : null;
        const isSmall = stageSize === 'small';

        // Dispositivos flasheables desde PlayCode (ESP32, vía esptool-js). Los
        // que no están aquí (p. ej. PlayBoard/Arduino UNO = ATmega328p, que se
        // flashea con Arduino IDE) NO muestran el botón "Actualizar Firmware".
        const FIRMWARE_UPDATABLE = ['playiot', 'playme', 'playgo'];
        const canUpdateFirmware = selectedDevice &&
            FIRMWARE_UPDATABLE.includes(selectedDevice.extensionId);

        // Dispositivos que pueden ejecutar un programa compilado por su cuenta
        // (sin el computador conectado). Se amplía por fases a medida que cada
        // firmware incorpora el intérprete de bytecode.
        const PROGRAM_UPLOADABLE = ['playgo'];
        const canUploadProgram = selectedDevice &&
            PROGRAM_UPLOADABLE.includes(selectedDevice.extensionId);

        const isProgramRunning = programStatus && programStatus.st === 'running';
        // Hay programa guardado tanto si está corriendo como si está detenido:
        // en ambos casos sigue en la memoria del robot y volverá a arrancar al
        // encenderlo.
        const hasProgram = programStatus &&
            (programStatus.st === 'running' || programStatus.st === 'loaded');
        const PROGRAM_STATE_LABELS = {
            running: 'Corriendo en el robot',
            loaded: 'Cargado (detenido)',
            empty: 'Sin programa',
            error: 'Con error'
        };

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
                        {/* Botón "+ Añadir" inmediatamente después de las cards, dentro
                            del scroll, para que sea siempre visible junto a los devices. */}
                        <button
                            className={styles.addDeviceButtonList}
                            onClick={onAddDevice}
                        >
                            + Añadir Dispositivo
                        </button>
                    </div>
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

                                    {canUploadProgram && selectedDevice.isConnected && programStatus && (
                                        <div className={styles.infoRow}>
                                            <span className={styles.infoLabel}>
                                                Programa
                                            </span>
                                            <span className={styles.infoValue}>
                                                {PROGRAM_STATE_LABELS[programStatus.st] || '—'}
                                                {programStatus.sz > 0 && ` · ${programStatus.sz} B`}
                                            </span>
                                        </div>
                                    )}

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

                                            {/* Acción primaria: una vez existe, es lo más
                                                importante que se puede hacer con el robot. */}
                                            {canUploadProgram && (
                                                <button
                                                    className={classNames(styles.button, styles.uploadButton)}
                                                    onClick={onUploadProgram}
                                                    title="Envía tus bloques al robot para que funcione sin el computador"
                                                >
                                                    {'⬆ Subir a la placa'}
                                                </button>
                                            )}

                                            {canUploadProgram && isProgramRunning && (
                                                <button
                                                    className={classNames(styles.button, styles.stopProgramButton)}
                                                    onClick={onStopProgram}
                                                >
                                                    {'■ Detener programa'}
                                                </button>
                                            )}

                                            {/* Borrar solo aparece si hay algo que borrar. Sin esto,
                                                un programa subido acompaña al robot para siempre:
                                                arranca solo cada vez que se enciende. */}
                                            {/* El control es util en los DOS modos: en vivo
                                                y con el programa autonomo corriendo. Por eso no
                                                depende de que haya programa subido. */}
                                            {canUploadProgram && (
                                                <button
                                                    className={classNames(styles.button, styles.remoteButton)}
                                                    onClick={onOpenRemote}
                                                    title="Manda botones al robot desde la pantalla o el teclado"
                                                >
                                                    {'🎮 Control remoto'}
                                                </button>
                                            )}

                                            {canUploadProgram && hasProgram && (
                                                <button
                                                    className={classNames(styles.button, styles.eraseProgramButton)}
                                                    onClick={onEraseProgram}
                                                    title="Quita el programa de la memoria del robot"
                                                >
                                                    {'🗑 Borrar programa'}
                                                </button>
                                            )}

                                            {canUpdateFirmware && (
                                                <button
                                                    className={classNames(styles.button, styles.firmwareButton)}
                                                    onClick={onUpdateFirmware}
                                                >
                                                    Actualizar Firmware
                                                </button>
                                            )}
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
    onUploadProgram: PropTypes.func,
    onStopProgram: PropTypes.func,
    onEraseProgram: PropTypes.func,
    onOpenRemote: PropTypes.func,
    programStatus: PropTypes.shape({
        st: PropTypes.string,
        sz: PropTypes.number,
        crc: PropTypes.number,
        err: PropTypes.number
    }),
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
    onUploadProgram: () => { },
    onStopProgram: () => { },
    onEraseProgram: () => { },
    onOpenRemote: () => { },
    onAddDevice: () => { },
    onRemoveDevice: () => { },
    onLoadExtension: () => { }
};

export default DevicePanel;