import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { ESPLoader, Transport } from 'esptool-js';
import styles from './firmware-updater-modal.css';

const PLAYIOT_ID = 'playiot';
const PLAYME_ID = 'playme';
const PLAYGO_ID = 'playgo';
// Solo PlayMe usa USB-JTAG nativo del ESP32-S3 (sin puente serie, sin pulso
// DTR/RTS de reset). PlayGo, aunque también es ESP32-S3, tiene un puente
// CH340K + circuito de auto-reset por DTR (igual que PlayIoT, confirmado en
// el esquemático v7.1) — así que se agrupa con PlayIoT, no con PlayMe.
const isNativeUsbChip = id => id === PLAYME_ID;

const FirmwareUpdaterModal = ({ port, extensionId, onClose, onUpdatingChange, onReconnect }) => {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Iniciando...');
    const [error, setError] = useState(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [selectedExtension, setSelectedExtension] = useState(null);
    // PlayGo tiene un circuito de auto-reset (CH340 + flip-flop) que en teoría
    // podría no necesitar el paso manual de BOOT, pero sin poder probarlo en
    // hardware real se deja en modo seguro (igual que PlayIoT) hasta confirmar
    // empíricamente que el auto-reset funciona solo.
    const [waitingForBoot, setWaitingForBoot] = useState(
        extensionId === PLAYIOT_ID || extensionId === PLAYGO_ID
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
            // Retry main() up to 5 times — CH340 on Windows after abrupt disconnect
            // can take 1-3s for the driver to fully release the COM port handle.
            let mainError = null;
            for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                    await esploader.main();
                    mainError = null;
                    break;
                } catch (err) {
                    mainError = err;
                    const isPortBusy = err && (
                        (err.name === 'NetworkError') ||
                        (err.message && err.message.includes('Failed to open serial port'))
                    );
                    if (!isPortBusy || attempt === 5) {
                        throw err;
                    }
                    console.warn(`[PlayMe] Intento ${attempt}/5 — puerto ocupado, reintentando en 1s...`);
                    setStatus(`Esperando puerto... (${attempt}/5)`);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            if (mainError) throw mainError;
            setProgress(15);

            // ====== PASO 4: FLASHEAR ======
            setStatus(`Escribiendo firmware ${extension.toUpperCase()}...`);
            setProgress(20);

            // ESP32-S3 (PlayMe, PlayGo): bootloader at 0x0000. Original ESP32 (PlayIoT): 0x1000.
            const bootloaderAddress = isNativeUsbChip(extensionId) ? 0x0000 : 0x1000;
            const filesData = [
                { data: bootloader, address: bootloaderAddress },
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

            if (isNativeUsbChip(extensionId)) {
                // ESP32-S3 USB-JTAG (PlayMe, PlayGo): RTS → EN pin. HardReset(usingUsbOtg=true)
                // solo libera RTS pero nunca lo aserta, así que es un no-op después de main().
                // Pulsamos RTS manualmente: HIGH (EN bajo = reset) → LOW (EN alto = boot).
                try {
                    await transport.setRTS(true);
                    await new Promise(r => setTimeout(r, 100));
                    await transport.setRTS(false);
                } catch (e) {
                    console.warn('Error en reset PlayMe/PlayGo:', e);
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

            // PlayMe/PlayGo: reconectar inmediatamente (como PIO: reset → monitor de una)
            // No esperar — el dispositivo arranca mientras el modal muestra éxito.
            if (isNativeUsbChip(extensionId) && onReconnect) {
                onReconnect(port);
            }

            // PlayIoT sigue reconectando desde handleCloseFirmwareModal (necesita más tiempo)
            const bootWait = isNativeUsbChip(extensionId) ? 800 : 1500;
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
                            <li>{'Sigue presionando BOOT hasta que la barra de progreso llegue al '}<strong>{'50%'}</strong></li>
                            <li>{'Suelta el botón y espera a que finalice'}</li>
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
    onReconnect: PropTypes.func,
    port: PropTypes.object,
    extensionId: PropTypes.string
};

export default FirmwareUpdaterModal;