import React, { useState, useEffect, useContext } from 'react';
import { SerialContext } from '../gui/SerialContext';
import styles from './firmware-updater.module.css';

const UpdaterModal = ({ onClose, onUpdatingChange }) => {
    const serialPort = useContext(SerialContext);  // Accede a PlayIotSerial
    
    const [step, setStep] = useState('selecting');
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [selectedPort, setSelectedPort] = useState(null);
    const [availablePorts, setAvailablePorts] = useState([]);
    const [loadingPorts, setLoadingPorts] = useState(false);

    useEffect(() => {
        // Cargar puertos al abrir el modal
        loadAvailablePorts();
        
        // 🔴 NUEVO: Escuchar eventos de conexión/desconexión de puertos
        const handleConnect = () => {
            console.log('📱 Puerto conectado - actualizando lista...');
            loadAvailablePorts();
        };
        
        const handleDisconnect = () => {
            console.log('📱 Puerto desconectado - actualizando lista...');
            loadAvailablePorts();
        };

        if (navigator.serial) {
            navigator.serial.addEventListener('connect', handleConnect);
            navigator.serial.addEventListener('disconnect', handleDisconnect);
        }

        // Limpiar listeners al desmontar
        return () => {
            if (navigator.serial) {
                navigator.serial.removeEventListener('connect', handleConnect);
                navigator.serial.removeEventListener('disconnect', handleDisconnect);
            }
        };
    }, []);

    const loadAvailablePorts = async () => {
        setLoadingPorts(true);
        try {
            const response = await fetch('http://localhost:5000/ports');
            const data = await response.json();
            setAvailablePorts(data.ports || []);
            
            if (data.ports.length === 0) {
                setStatus('No se detectaron puertos seriales');
            } else {
                // Seleccionar automáticamente el primer puerto
                if (!selectedPort && data.ports.length > 0) {
                    setSelectedPort(data.ports[0]);
                }
            }
        } catch (err) {
            setErrorMessage(`Error al obtener puertos: ${err.message}`);
        } finally {
            setLoadingPorts(false);
        }
    };

    const handleStartUpdate = async () => {
        if (!selectedPort) {
            setErrorMessage('Debe seleccionar un puerto');
            return;
        }

        onUpdatingChange(true);
        setStep('updating');
        setProgress(0);
        setStatus('Iniciando actualización...');
        setErrorMessage('');

        try {
            // 🔴 AQUÍ: Desconecta WebSerial ANTES de flashear de forma LIMPIA
            if (serialPort && serialPort.isPortOpen()) {
                setStatus('Desconectando puerto serial...');
                console.log('🔌 Desconectando WebSerial para flasheo...');
                
                // Usar el mismo método de desconexión limpia
                serialPort.keepReading = false;
                await serialPort._cleanupBeforeReconnect();
                serialPort.connected = false;
                
                // 🔴 Notifica a Scratch que se desconectó
                const peripheral = window.playIotPeripheral;
                if (peripheral && peripheral._runtime) {
                    peripheral._connectedDeviceId = null;
                    console.log('📢 Notificando a Scratch: PERIPHERAL_DISCONNECTED');
                    peripheral._runtime.emit(
                        peripheral._runtime.constructor.PERIPHERAL_DISCONNECTED
                    );
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            setProgress(25);
            setStatus('Conectando a ESP32...');

            const portName = selectedPort.path;
            console.log('Puerto seleccionado para esptool:', portName);

            await new Promise(resolve => setTimeout(resolve, 1000));
            setProgress(40);
            setStatus('Flasheando firmware...');

            // Llamar al servidor backend
            const response = await fetch('http://localhost:5000/flash', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    port: portName
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al flashear');
            }

            setProgress(85);
            setStatus('Finalizando...');

            await new Promise(resolve => setTimeout(resolve, 2000));

            setStep('success');
            setProgress(100);
            setStatus('¡Firmware actualizado correctamente!');

        } catch (err) {
            setStep('error');
            setErrorMessage(err.message);
            console.error('Error durante flasheo:', err);
        } finally {
            onUpdatingChange(false);
        }
    };

    const handleClose = () => {
        if (step !== 'updating') {
            onClose();
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>Actualizar Firmware ESP32</h2>
                    {step !== 'updating' && (
                        <button className={styles.closeBtn} onClick={handleClose}>✕</button>
                    )}
                </div>

                <div className={styles.content}>
                    {step === 'selecting' && (
                        <div className={styles.section}>
                            <p className={styles.description}>
                                Selecciona el puerto donde está conectado tu ESP32
                            </p>

                            {loadingPorts ? (
                                <div className={styles.loading}>Cargando puertos...</div>
                            ) : (
                                <>
                                    {availablePorts.length > 0 ? (
                                        <div className={styles.portList}>
                                            {availablePorts.map((port, idx) => (
                                                <button
                                                    key={idx}
                                                    className={`${styles.portOption} ${
                                                        selectedPort?.path === port.path ? styles.selected : ''
                                                    }`}
                                                    onClick={() => setSelectedPort(port)}
                                                >
                                                    <span className={styles.portName}>
                                                        {port.path} ({port.manufacturer || 'Unknown'})
                                                    </span>
                                                    {selectedPort?.path === port.path && (
                                                        <span className={styles.checkmark}>✓</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className={styles.noPort}>No se detectaron puertos</p>
                                    )}

                                    <button
                                        className={styles.selectBtn}
                                        onClick={loadAvailablePorts}
                                    >
                                        🔄 Actualizar puertos
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {step === 'updating' && (
                        <div className={styles.section}>
                            <div className={styles.spinner}></div>
                            <p className={styles.statusText}>{status}</p>
                            <div className={styles.progressBar}>
                                <div
                                    className={styles.progressFill}
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                            <p className={styles.progressPercent}>{progress}%</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className={styles.section}>
                            <div className={styles.successIcon}>✓</div>
                            <h3 className={styles.successTitle}>¡Actualización completada!</h3>
                            <p className={styles.successMessage}>
                                El firmware se ha instalado correctamente.
                            </p>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className={styles.section}>
                            <div className={styles.errorIcon}>✕</div>
                            <h3 className={styles.errorTitle}>Error en la actualización</h3>
                            <p className={styles.errorMessage}>{errorMessage}</p>
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    {step === 'selecting' && (
                        <>
                            <button className={styles.cancelBtn} onClick={handleClose}>Cancelar</button>
                            <button
                                className={styles.startBtn}
                                onClick={handleStartUpdate}
                                disabled={!selectedPort}
                            >
                                Actualizar
                            </button>
                        </>
                    )}

                    {(step === 'success' || step === 'error') && (
                        <button className={styles.closeModalBtn} onClick={handleClose}>
                            Cerrar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UpdaterModal;