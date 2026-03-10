import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { ESPLoader, Transport } from 'esptool-js';
import styles from './firmware-updater-modal.css';

const PLAYIOT_ID = 'playiot';
const PLAYME_ID = 'playme';

const FirmwareUpdaterModal = ({ port, extensionId, onClose, onUpdatingChange }) => {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Iniciando...');
    const [error, setError] = useState(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [selectedExtension, setSelectedExtension] = useState(null);
    const [waitingForBoot, setWaitingForBoot] = useState(
        extensionId === PLAYIOT_ID
    );

    // Iniciar flasheo automáticamente si no se requiere paso de Boot
    useEffect(() => {
        if (extensionId && !selectedExtension && !error && !isSuccess && !waitingForBoot) {
            handleStartFlasheo(extensionId);
        }
    }, [extensionId, waitingForBoot]);

    const handleStartFlasheo = async extension => {
        if (!port) {
            setError('Error: Puerto no disponible');
            return;
        }

        setSelectedExtension(extension);
        onUpdatingChange(true);
        setError(null);

        let transport = null;

        try {
            setStatus(`Preparando descarga para ${extension.toUpperCase()}...`);
            setProgress(5);

            // ====== PASO 1: DESCARGAR BINARIOS ======
            const baseUrl = `https://playcode.tdrobotica.co/firmware/${extension}`;

            const downloadFile = async name => {
                const response = await fetch(`${baseUrl}/${name}`);
                if (!response.ok) throw new Error(`No se pudo descargar ${name} para ${extension}`);
                return await response.arrayBuffer();
            };

            const [bootloader, partitions, firmware] = await Promise.all([
                downloadFile('bootloader.bin'),
                downloadFile('partitions.bin'),
                downloadFile('firmware.bin')
            ]);

            // ====== PASO 2: CREAR ESPLOADER ======
            setStatus('Sincronizando dispositivo...');
            setProgress(10);

            const espLoaderTerminal = {
                clean() { },
                writeLine(data) { console.log(String(data)); },
                write(data) { console.log(String(data)); }
            };

            transport = new Transport(port);
            const esploader = new ESPLoader({
                transport: transport,
                baudrate: 460800,
                terminal: espLoaderTerminal
            });

            // ====== PASO 3: MAIN (RESET, HANDSHAKE) ======
            await esploader.main();
            setProgress(15);

            // ====== PASO 4: FLASHEAR ======
            setStatus(`Escribiendo firmware ${extension.toUpperCase()}...`);
            setProgress(20);

            const filesData = [
                { data: bootloader, address: 0x1000 },
                { data: partitions, address: 0x8000 },
                { data: firmware, address: 0x10000 }
            ];

            let totalBytes = 0;
            let writtenBytes = 0;
            for (const file of filesData) {
                totalBytes += file.data.byteLength;
            }

            const FLASH_BLOCK_SIZE = 4096;

            for (let fileIndex = 0; fileIndex < filesData.length; fileIndex++) {
                const file = filesData[fileIndex];
                const data = new Uint8Array(file.data);
                const address = file.address;

                await esploader.flashBegin(data.length, address);

                for (let i = 0; i < data.length; i += FLASH_BLOCK_SIZE) {
                    const chunkSize = Math.min(FLASH_BLOCK_SIZE, data.length - i);
                    const chunk = data.slice(i, i + chunkSize);
                    const blockNum = Math.floor(i / FLASH_BLOCK_SIZE);

                    await esploader.flashBlock(chunk, blockNum, 5000);
                    writtenBytes += chunkSize;
                    const currentProgress = Math.round(20 + ((writtenBytes / totalBytes) * 75));
                    setProgress(currentProgress);
                }
                await esploader.flashFinish(false);
            }

            setProgress(95);

            // ====== PASO 5: RESET (condicional por placa) ======
            setStatus('Reiniciando dispositivo...');

            if (extensionId === PLAYME_ID) {
                // PlayMe: reset manual controlando señales DTR/RTS
                // El hard_reset de esptool deja las señales en un estado
                // que impide la reconexión posterior en esta placa.
                try {
                    await transport.setDTR(false);
                    await transport.setRTS(true);   // Liberar GPIO0 (no modo boot)
                    await new Promise(r => setTimeout(r, 100));
                    await transport.setDTR(true);   // Pulso EN → reset
                    await new Promise(r => setTimeout(r, 100));
                    await transport.setDTR(false);  // Liberar EN → ESP32 arranca
                } catch (e) {
                    console.warn('Error en reset manual PlayMe:', e);
                }
            } else {
                // PlayIoT: comportamiento original (funciona bien)
                try {
                    await esploader.after('hard_reset');
                } catch (e) {
                    console.warn('Error en reset:', e);
                }
            }

            // ====== PASO 6: DESCONECTAR TRANSPORTE ======
            if (transport) {
                try {
                    await transport.disconnect();
                    console.log('✅ Transporte de esptool-js desconectado.');
                } catch (e) {
                    console.warn('⚠️ Error al desconectar transporte:', e);
                }
                transport = null;
            }

            // Esperar que el firmware arranque antes de marcar éxito
            // PlayMe necesita más tiempo porque su circuito de reset es diferente
            const bootWait = extensionId === PLAYME_ID ? 5000 : 1500;
            await new Promise(resolve => setTimeout(resolve, bootWait));

            setProgress(100);
            setStatus('¡Firmware instalado!');
            setIsSuccess(true);

        } catch (err) {
            console.error('Error durante flasheo:', err);
            setError(err.message || 'Error durante la actualización');
            setSelectedExtension(null);

            // En caso de error, también liberar el transporte
            if (transport) {
                try {
                    await transport.disconnect();
                } catch (e) {
                    console.warn('⚠️ Error al desconectar transporte tras fallo:', e);
                }
            }
        } finally {
            onUpdatingChange(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2 className={styles.title}>⚡ Actualizador de Firmware</h2>
                    {!selectedExtension && (
                        <button
                            className={styles.closeButton}
                            onClick={onClose}
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* --- PASO BOOT PARA PLAYIOT --- */}
                {waitingForBoot && !error && !isSuccess && (
                    <div className={styles.bootStep}>
                        <div className={styles.bootStepIcon}>{'🔴'}</div>
                        <p className={styles.bootStepTitle}>{'Preparar PlayIoT para actualización'}</p>
                        <ol className={styles.bootStepList}>
                            <li>{'Mantén presionado el botón '}<strong>{'BOOT'}</strong>{' de tu PlayIoT'}</li>
                            <li>{'Haz clic en '}<strong>{'Actualizar'}</strong>{' sin soltar el botón'}</li>
                            <li>{'Suelta el botón BOOT cuando veas el progreso'}</li>
                        </ol>
                        <button
                            className={styles.actionButton}
                            onClick={() => setWaitingForBoot(false)}
                        >
                            {'Actualizar →'}
                        </button>
                    </div>
                )}

                {/* --- MENSAJE INICIAL SI NO HAY EXTENSIÓN --- */}
                {!waitingForBoot && !selectedExtension && !error && !isSuccess && (
                    <div className={styles.selectionArea}>
                        <p className={styles.selectionText}>Identificando dispositivo...</p>
                    </div>
                )}

                {/* --- VISTA DE PROGRESO --- */}
                {selectedExtension && (
                    <div className={styles.progressArea}>
                        <p style={{ fontSize: '14px', color: '#555', marginBottom: '10px' }}>
                            <strong>Instalando:</strong> {selectedExtension.toUpperCase()}
                        </p>
                        <p className={styles.statusText}>{status}</p>
                        <div className={styles.progressBarContainer}>
                            <div
                                className={styles.progressBar}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className={styles.progressPercent}>{progress}%</div>
                    </div>
                )}

                {error && (
                    <div className={styles.error}>
                        ⚠ {error}
                    </div>
                )}

                {isSuccess && (
                    <div className={styles.success}>
                        ✅ <strong>{selectedExtension.toUpperCase()}</strong> instalado con éxito.
                    </div>
                )}

                <div className={styles.footer}>
                    {(error || isSuccess) && (
                        <button
                            className={styles.actionButton}
                            onClick={onClose}
                        >
                            Cerrar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

FirmwareUpdaterModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    onUpdatingChange: PropTypes.func.isRequired,
    port: PropTypes.object,
    extensionId: PropTypes.string
};

export default FirmwareUpdaterModal;