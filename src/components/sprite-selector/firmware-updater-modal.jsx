import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { ESPLoader, Transport } from 'esptool-js';
import md5 from 'js-md5';
import styles from './firmware-updater-modal.css';

// Marca de version del flasheador. Sirve para saber, MIRANDO LA CONSOLA, si el
// navegador esta ejecutando este codigo o un bundle viejo en cache -- durante
// la depuracion de la corrupcion de flash de PlayGo se perdio tiempo sin poder
// distinguir "el arreglo no sirve" de "el arreglo ni siquiera se esta usando".
const FLASHER_VERSION = 'v3-writeFlash+md5';

/**
 * esptool-js entrega y espera "binary strings" (un caracter por byte). js-md5
 * interpretaria esa cadena como UTF-8 y daria un hash equivocado para cualquier
 * byte > 0x7F, asi que hay que convertirla a bytes explicitamente.
 * @param {string} binaryString Cadena binaria, un caracter por byte.
 * @returns {string} Hash MD5 en hexadecimal.
 */
const md5OfBinaryString = binaryString =>
    md5(Uint8Array.from(binaryString, ch => ch.charCodeAt(0)));

const PLAYIOT_ID = 'playiot';
const PLAYME_ID = 'playme';
const PLAYGO_ID = 'playgo';
// Solo PlayMe usa USB-JTAG nativo del ESP32-S3 (sin puente serie, sin pulso
// DTR/RTS de reset). PlayGo, aunque también es ESP32-S3, tiene un puente
// CH340K + circuito de auto-reset por DTR (igual que PlayIoT, confirmado en
// el esquemático v7.1) — así que se agrupa con PlayIoT, no con PlayMe.
// OJO: esto es SOLO para el reset por DTR/RTS. No sirve para decidir la
// direccion del bootloader (ver isEsp32S3 abajo) -- son dos propiedades
// independientes (tipo de puente USB vs variante de chip) que coinciden en
// PlayIoT y PlayMe pero NO en PlayGo, que es ESP32-S3 con puente CH340.
const isNativeUsbChip = id => id === PLAYME_ID;

// La direccion del bootloader la fija la VARIANTE DE CHIP (0x0000 en
// ESP32-S3/S2/C3..., 0x1000 en el ESP32 original de PlayIoT), no el tipo de
// puente USB. Antes esta linea reusaba isNativeUsbChip() por error: como
// isNativeUsbChip solo es true para PlayMe, PlayGo (que SI es ESP32-S3)
// caia en la rama de 0x1000 -- el bootloader se escribia en la direccion
// equivocada en CADA flasheo de PlayGo, dejando al ROM bootloader sin nada
// valido en 0x0000 ("Invalid image block, can't boot", 100% reproducible).
const isEsp32S3 = id => id === PLAYME_ID || id === PLAYGO_ID;

const FirmwareUpdaterModal = ({ port, extensionId, onClose, onUpdatingChange, onReconnect }) => {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Iniciando...');
    const [error, setError] = useState(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [selectedExtension, setSelectedExtension] = useState(null);
    // PlayGo NO pide BOOT manual: su circuito de auto-reset (CH340 + flip-flop)
    // funciona -- confirmado en hardware real, PlatformIO lo flashea de forma
    // repetida sin tocar ningún botón, usando ese mismo circuito.
    //
    // Además, pedir BOOT era ACTIVAMENTE DAÑINO en PlayGo: al mantenerlo pulsado
    // durante el reset posterior al flasheo, GPIO0 sigue en bajo y el chip
    // rearranca en MODO DESCARGA en vez de en la aplicación. La placa parecía
    // "congelada" (sin telemetría) aunque la escritura hubiera sido correcta.
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
            const bootloaderAddress = isEsp32S3(extensionId) ? 0x0000 : 0x1000;

            // Usar esploader.writeFlash() (la API de alto nivel de esptool-js) en vez de
            // reimplementar flashBegin/flashBlock/flashFinish a mano: esa reimplementacion
            // troceaba en bloques de 4096 bytes, pero esploader.FLASH_WRITE_SIZE es en
            // realidad 0x4000 (16384) -- el dispositivo interpreta cada numero de secuencia
            // como un bloque de 16384 bytes (offset + seq*16384), asi que los datos
            // terminaban escritos en direcciones equivocadas con huecos sin escribir de por
            // medio. Eso es lo que dejaba "Invalid image block, can't boot" en el bootloader.
            // writeFlash() ya maneja el tamano de bloque, el padding y la compresion
            // correctamente (es el mismo camino que usa esptool.py / PlatformIO, que nunca
            // tuvo este problema).
            const fileArray = [
                { data: esploader.ui8ToBstr(new Uint8Array(bootloader)), address: bootloaderAddress },
                { data: esploader.ui8ToBstr(new Uint8Array(partitions)), address: 0x8000 },
                { data: esploader.ui8ToBstr(new Uint8Array(firmware)), address: 0x10000 }
            ];
            const fileSizes = fileArray.map(f => f.data.length);
            const totalBytes = fileSizes.reduce((a, b) => a + b, 0);

            // Traza de diagnostico: si esto no aparece en la consola, el navegador
            // esta corriendo un bundle viejo en cache (recargar con Ctrl+Shift+R).
            console.log(`[flasher ${FLASHER_VERSION}] dispositivo=${extensionId}`, {
                stub: esploader.IS_STUB,
                flashWriteSize: `0x${(esploader.FLASH_WRITE_SIZE || 0).toString(16)}`,
                destinos: fileArray.map((f, i) =>
                    `0x${f.address.toString(16).padStart(4, '0')} <- ${fileSizes[i]} bytes`)
            });

            await esploader.writeFlash({
                fileArray,
                flashSize: 'keep',
                flashMode: 'keep',
                flashFreq: 'keep',
                eraseAll: false,
                // SIN esto, un fallo de escritura corrompe la placa EN SILENCIO: el
                // modal dice "instalado con exito" y el equipo queda sin arrancar
                // ("Invalid image block, can't boot"). Con la verificacion activa,
                // esptool-js relee el hash desde la flash y lanza "MD5 of file does
                // not match data in flash!" en vez de dar por bueno un flasheo roto.
                calculateMD5Hash: md5OfBinaryString,
                compress: true,
                reportProgress: (fileIndex, written) => {
                    const bytesBefore = fileSizes.slice(0, fileIndex).reduce((a, b) => a + b, 0);
                    const writtenBytes = bytesBefore + written;
                    const currentProgress = Math.round(20 + ((writtenBytes / totalBytes) * 75));
                    setProgress(currentProgress);
                }
            });

            setProgress(95);

            // ====== PASO 5: RESET (condicional por placa) ======
            setStatus('Reiniciando dispositivo...');

            if (isNativeUsbChip(extensionId)) {
                // ESP32-S3 USB-JTAG (PlayMe): RTS → EN pin. HardReset(usingUsbOtg=true)
                // solo libera RTS pero nunca lo aserta, así que es un no-op después de main().
                // Pulsamos RTS manualmente: HIGH (EN bajo = reset) → LOW (EN alto = boot).
                try {
                    await transport.setRTS(true);
                    await new Promise(r => setTimeout(r, 100));
                    await transport.setRTS(false);
                } catch (e) {
                    console.warn('Error en reset PlayMe:', e);
                }
            } else if (extensionId === PLAYGO_ID) {
                // PlayGo (CH340 + auto-reset): reset explícito que DEJA AMBAS LÍNEAS en
                // estado de ejecución. El HardReset de esptool-js solo hace setRTS(false)
                // y NUNCA toca DTR -- si DTR queda aserto, GPIO0 se mantiene en bajo y el
                // chip rearranca en MODO DESCARGA en vez de en la aplicación: la placa
                // parece "congelada" (sin telemetría) aunque la escritura fuera perfecta.
                // DTR=false -> GPIO0 alto (arranque normal); pulso RTS -> EN bajo y alto.
                try {
                    await transport.setDTR(false);
                    await transport.setRTS(true);
                    await new Promise(r => setTimeout(r, 100));
                    await transport.setRTS(false);
                } catch (e) {
                    console.warn('Error en reset PlayGo:', e);
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
                        <p className={styles.bootStepTitle}>
                            {`Preparar ${(extensionId || '').toUpperCase() || 'dispositivo'} para actualización`}
                        </p>
                        <ol className={styles.bootStepList}>
                            <li>
                                {'Mantén presionado el botón '}<strong>{'BOOT'}</strong>
                                {` de tu ${(extensionId || '').toUpperCase() || 'dispositivo'}`}
                            </li>
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