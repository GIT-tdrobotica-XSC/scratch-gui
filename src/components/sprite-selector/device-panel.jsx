import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import styles from './device-panel.css';

/**
 * Panel de dispositivos.
 *
 * Se lee de arriba abajo respondiendo una pregunta por bloque:
 *   1. ¿CUÁL es mi robot?      -> tira selectora
 *   2. ¿EN QUÉ ESTADO está?    -> héroe con el robot en grande
 *   3. ¿QUÉ puedo hacer?       -> acciones sobre el programa
 *
 * La versión anterior mostraba lista y detalle en dos columnas, con todo
 * compitiendo a la vez y una fila por dato. Esto solo cambia la disposición
 * y el aspecto: los handlers y las condiciones que deciden qué se ve son
 * exactamente los mismos.
 */
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
        // El ancho ya no se decide con el prop stageSize: device-panel.css usa
        // container queries, que miden el contenedor real. Es más fiable (y
        // además inmune al zoom del navegador) que un flag heredado del
        // tamaño del escenario.

        // Dispositivos flasheables desde PlayCode (ESP32, vía esptool-js). Los
        // que no están aquí (p. ej. PlayBoard/Arduino UNO = ATmega328p, que se
        // flashea con Arduino IDE) NO muestran el botón "Actualizar Firmware".
        const FIRMWARE_UPDATABLE = ['playiot', 'playme', 'playgo'];
        const canUpdateFirmware = selectedDevice &&
            FIRMWARE_UPDATABLE.includes(selectedDevice.extensionId);

        // En producción permanece oculto mientras dura la prueba de campo con
        // la PlayGo "pelada" (oculta en cascada subir/detener/borrar programa y
        // el control remoto, sin tocar el JSX de abajo). En local (npm start)
        // se muestra siempre, para poder seguir probando sin editar este
        // archivo a mano cada vez. Mismo patrón que ya usan keycloak-hoc.jsx y
        // playground/player.jsx: webpack resuelve NODE_ENV según el modo.
        const PROGRAM_UPLOADABLE = process.env.NODE_ENV === 'production' ? [] : ['playgo'];
        const canUploadProgram = selectedDevice &&
            PROGRAM_UPLOADABLE.includes(selectedDevice.extensionId);

        const isProgramRunning = programStatus && programStatus.st === 'running';
        // Hay programa guardado tanto si está corriendo como si está detenido:
        // en ambos casos sigue en la memoria del robot y volverá a arrancar al
        // encenderlo.
        const hasProgram = programStatus &&
            (programStatus.st === 'running' || programStatus.st === 'loaded');
        const PROGRAM_STATE_LABELS = {
            running: 'Corriendo',
            loaded: 'Cargado',
            empty: 'Sin programa',
            error: 'Con error'
        };

        if (!selectedDevice) {
            return (
                <div className={styles.panel}>
                    <div className={styles.empty}>
                        <span className={styles.emptyArt}>{'🔌'}</span>
                        <p className={styles.emptyTitle}>{'Sin dispositivos'}</p>
                        <p className={styles.emptyText}>{'Añade tu robot para empezar a programarlo'}</p>
                        <button
                            className={classNames(styles.key, styles.keyPrimary)}
                            onClick={onAddDevice}
                        >
                            {'+ Añadir dispositivo'}
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className={styles.panel}>

                {/* 1. ¿CUÁL es mi robot? */}
                <div className={styles.strip}>
                    {devices.map((device, index) => (
                        <span
                            className={styles.chipWrap}
                            key={device.id}
                        >
                            <button
                                className={classNames(styles.chip, {
                                    [styles.chipOn]: selectedDeviceIndex === index
                                })}
                                onClick={() => this.handleSelectDevice(index)}
                                title={device.name}
                            >
                                {device.icon && (
                                    <img
                                        className={styles.chipIcon}
                                        src={device.icon}
                                        draggable={false}
                                        alt=""
                                    />
                                )}
                                <span className={styles.chipName}>{device.name}</span>
                                <span
                                    className={classNames(styles.chipDot, {
                                        [styles.chipDotOn]: device.isConnected
                                    })}
                                />
                            </button>
                            <button
                                className={styles.chipRemove}
                                title="Quitar dispositivo"
                                onClick={e => {
                                    e.stopPropagation();
                                    onRemoveDevice(index);
                                }}
                            >
                                {'×'}
                            </button>
                        </span>
                    ))}
                    <button
                        className={styles.chipAdd}
                        onClick={onAddDevice}
                        title="Añadir dispositivo"
                    >
                        {'+'}
                    </button>
                </div>

                {/* 2. ¿EN QUÉ ESTADO está?
                    En fila y no apilado: la columna del escenario es corta y un
                    pódium alto empujaba las acciones fuera de la vista. */}
                <div className={classNames(styles.hero, {[styles.heroLive]: selectedDevice.isConnected})}>
                    <div className={styles.heroRow}>
                        <div className={styles.pod}>
                            {selectedDevice.icon ? (
                                <img
                                    className={styles.podArt}
                                    src={selectedDevice.icon}
                                    draggable={false}
                                    alt=""
                                />
                            ) : (
                                <span className={styles.podFallback}>{'🤖'}</span>
                            )}
                        </div>
                        <div className={styles.heroText}>
                            <p className={styles.heroName}>{selectedDevice.name}</p>
                            <p className={styles.heroState}>
                                <span
                                    className={classNames(styles.beat, {
                                        [styles.beatOn]: selectedDevice.isConnected
                                    })}
                                />
                                {selectedDevice.isConnected ? 'Conectado' : 'Desconectado'}
                            </p>
                            {selectedDevice.port && (
                                <span className={styles.heroTag}>{selectedDevice.port}</span>
                            )}
                        </div>
                    </div>

                    {selectedDevice.isConnected ? (
                        <button
                            className={classNames(styles.key, styles.keyGhost, styles.keyDanger)}
                            onClick={onDisconnect}
                        >
                            {'Desconectar'}
                        </button>
                    ) : (
                        <button
                            className={classNames(styles.key, styles.keyPrimary)}
                            onClick={onConnect}
                        >
                            {'Conectar'}
                        </button>
                    )}
                </div>

                {/* 3. ¿QUÉ puedo hacer? */}
                {selectedDevice.isConnected && (
                    <div className={styles.acts}>

                        {canUploadProgram && programStatus && (
                            <div className={styles.progRow}>
                                {'Programa en la placa'}
                                <span
                                    className={classNames(
                                        styles.progBadge,
                                        styles[`progBadge${(programStatus.st || 'empty')
                                            .replace(/^./, c => c.toUpperCase())}`]
                                    )}
                                >
                                    {PROGRAM_STATE_LABELS[programStatus.st] || '—'}
                                </span>
                            </div>
                        )}

                        {/* Acción primaria: una vez existe, es lo más
                            importante que se puede hacer con el robot. */}
                        {canUploadProgram && (
                            <button
                                className={classNames(styles.key, styles.keyPrimary)}
                                onClick={onUploadProgram}
                                title="Envía tus bloques al robot para que funcione sin el computador"
                            >
                                {'Subir a la placa'}
                            </button>
                        )}

                        {canUploadProgram && (
                            <div className={styles.duo}>
                                {isProgramRunning && (
                                    <button
                                        className={classNames(styles.key, styles.keyGhost, styles.keyWarn)}
                                        onClick={onStopProgram}
                                    >
                                        {'Detener'}
                                    </button>
                                )}
                                {/* El control es util en los DOS modos: en vivo
                                    y con el programa autonomo corriendo. Por eso no
                                    depende de que haya programa subido. */}
                                <button
                                    className={classNames(styles.key, styles.keyGhost, styles.keyRemote)}
                                    onClick={onOpenRemote}
                                    title="Manda botones al robot desde la pantalla o el teclado"
                                >
                                    {'Mando'}
                                </button>
                            </div>
                        )}

                        {/* Borrar solo aparece si hay algo que borrar. Sin esto,
                            un programa subido acompaña al robot para siempre:
                            arranca solo cada vez que se enciende. */}
                        {canUploadProgram && hasProgram && (
                            <button
                                className={classNames(styles.key, styles.keyGhost, styles.keyErase)}
                                onClick={onEraseProgram}
                                title="Quita el programa de la memoria del robot"
                            >
                                {'Borrar programa'}
                            </button>
                        )}

                        {canUpdateFirmware && (
                            <button
                                className={classNames(styles.key, styles.keyGhost, styles.keyFirmware)}
                                onClick={onUpdateFirmware}
                            >
                                {'Actualizar firmware'}
                            </button>
                        )}
                    </div>
                )}
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
