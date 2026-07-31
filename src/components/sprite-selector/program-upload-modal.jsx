import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import styles from './program-upload-modal.css';

/**
 * Modal de "Subir a la placa": compila los bloques del dispositivo y envía el
 * bytecode resultante para que el robot pueda funcionar sin el computador.
 *
 * Sigue el mismo patrón que firmware-updater-modal (overlay propio, barra de
 * progreso, ramas de error y de éxito), pero la rama de error es distinta y es
 * la parte que más importa: cuando el programa no se puede compilar hay que
 * decir QUÉ bloque falla, en lenguaje entendible, y poder saltar a él. Un
 * error que no se puede señalar en pantalla no le sirve de nada a un niño.
 */

const PHASE_LABELS = {
    compile: 'Preparando tu programa...',
    begin: 'Hablando con el robot...',
    chunk: 'Enviando el programa...',
    end: 'Comprobando que llegó completo...',
    done: '¡Listo!'
};

const ProgramUploadModal = ({ vm, targetId, peripheral, deviceName, transport, onClose }) => {
    const [progress, setProgress] = useState(0);
    const [phase, setPhase] = useState('compile');
    const [errors, setErrors] = useState(null);
    const [warnings, setWarnings] = useState([]);
    const [showWarnings, setShowWarnings] = useState(false);
    const [stats, setStats] = useState(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isBusy, setIsBusy] = useState(true);
    const startedRef = useRef(false);

    const runUpload = async () => {
        setIsBusy(true);
        setErrors(null);
        setIsSuccess(false);
        setProgress(0);
        setPhase('compile');

        let compiled;
        try {
            compiled = vm.compileDeviceProgram(targetId);
        } catch (group) {
            // El compilador devuelve TODOS los errores, no sólo el primero: un
            // niño con tres bloques mal debe verlos los tres de una vez.
            setErrors(group.errors || [{ message: group.message }]);
            setIsBusy(false);
            return;
        }

        setWarnings(compiled.warnings || []);

        try {
            const uploadStats = await peripheral.uploadProgram(compiled.bytes, {
                onProgress: (fraction, currentPhase) => {
                    setProgress(Math.round(fraction * 100));
                    if (currentPhase) setPhase(currentPhase);
                }
            });
            setStats({ ...compiled.stats, ...uploadStats });
            setProgress(100);
            setPhase('done');
            setIsSuccess(true);
        } catch (err) {
            setErrors([{
                message: err.message || 'No se pudo enviar el programa al robot.',
                reason: err.reason
            }]);
        } finally {
            setIsBusy(false);
        }
    };

    useEffect(() => {
        // Guard con ref y no con estado: en React 18 el modo estricto monta dos
        // veces en desarrollo, y sin esto se enviaría el programa por duplicado.
        if (startedRef.current) return;
        startedRef.current = true;
        runUpload();
    }, []);

    /**
     * Lleva al usuario hasta el bloque que causó el error y lo hace brillar.
     * Es lo que convierte un mensaje de error en algo accionable.
     * @param {string} blockId Id del bloque culpable.
     */
    const handleShowBlock = blockId => {
        if (!blockId) return;
        try {
            if (vm.editingTarget && vm.editingTarget.id !== targetId) {
                vm.setEditingTarget(targetId);
            }
            const workspace = window.Blockly && window.Blockly.getMainWorkspace &&
                window.Blockly.getMainWorkspace();
            if (workspace) {
                const block = workspace.getBlockById(blockId);
                if (block) {
                    workspace.centerOnBlock(blockId);
                    block.select();
                }
            }
            vm.runtime.glowBlock(blockId, true);
            setTimeout(() => {
                try {
                    vm.runtime.glowBlock(blockId, false);
                } catch (e) { /* el bloque pudo borrarse mientras tanto */ }
            }, 2500);
            onClose();
        } catch (e) {
            console.warn('No se pudo resaltar el bloque:', e);
        }
    };

    const canClose = !isBusy;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2 className={styles.title}>{'⬆ Subir a la placa'}</h2>
                    {canClose && (
                        <button className={styles.closeButton} onClick={onClose}>{'✕'}</button>
                    )}
                </div>

                {/* --- PROGRESO --- */}
                {!errors && !isSuccess && (
                    <div className={styles.progressArea}>
                        <p className={styles.deviceLine}>
                            <strong>{'Robot: '}</strong>{deviceName}
                            {transport === 'ble' && (
                                <span className={styles.bleHint}>
                                    {' · por Bluetooth (con cable es más rápido)'}
                                </span>
                            )}
                        </p>
                        <p className={styles.statusText}>{PHASE_LABELS[phase] || 'Trabajando...'}</p>
                        <div className={styles.progressBarContainer}>
                            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
                        </div>
                        <div className={styles.progressPercent}>{`${progress}%`}</div>
                    </div>
                )}

                {/* --- ERRORES DE COMPILACIÓN --- */}
                {errors && (
                    <div className={styles.errorArea}>
                        <p className={styles.errorHeading}>
                            {errors.length === 1 ?
                                'Hay algo que arreglar antes de subir:' :
                                `Hay ${errors.length} cosas que arreglar antes de subir:`}
                        </p>
                        <ul className={styles.errorList}>
                            {errors.map((err, i) => (
                                <li key={i} className={styles.errorItem}>
                                    <div className={styles.errorMessage}>{err.message}</div>
                                    {err.hint && (
                                        <div className={styles.errorHint}>{err.hint}</div>
                                    )}
                                    {err.blockId && (
                                        <button
                                            className={styles.showBlockButton}
                                            onClick={() => handleShowBlock(err.blockId)}
                                        >
                                            {'Ver el bloque'}
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* --- ÉXITO --- */}
                {isSuccess && (
                    <div className={styles.successArea}>
                        <div className={styles.successIcon}>{'🎉'}</div>
                        <p className={styles.successTitle}>{'¡Tu programa ya está en el robot!'}</p>
                        <p className={styles.successText}>
                            {'Puedes desconectar el cable: el robot seguirá funcionando solo, ' +
                             'y volverá a empezar cada vez que lo enciendas.'}
                        </p>
                        {stats && (
                            <p className={styles.statsLine}>
                                {`${stats.programSize} bytes · `}
                                {stats.threads === 1 ?
                                    '1 bandera verde' :
                                    `${stats.threads} banderas verdes`}
                            </p>
                        )}

                        {warnings.length > 0 && (
                            <div className={styles.warningsBox}>
                                <button
                                    className={styles.warningsToggle}
                                    onClick={() => setShowWarnings(!showWarnings)}
                                >
                                    {`${showWarnings ? '▾' : '▸'} ${warnings.length} ${
                                        warnings.length === 1 ? 'aviso' : 'avisos'}`}
                                </button>
                                {showWarnings && (
                                    <ul className={styles.warningList}>
                                        {warnings.map((w, i) => (
                                            <li key={i} className={styles.warningItem}>{w.message}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className={styles.footer}>
                    {errors && (
                        <button className={styles.retryButton} onClick={runUpload}>
                            {'Intentar de nuevo'}
                        </button>
                    )}
                    {canClose && (
                        <button className={styles.actionButton} onClick={onClose}>
                            {isSuccess ? 'Listo' : 'Cerrar'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

ProgramUploadModal.propTypes = {
    vm: PropTypes.object.isRequired,
    targetId: PropTypes.string,
    peripheral: PropTypes.object,
    deviceName: PropTypes.string,
    transport: PropTypes.string,
    onClose: PropTypes.func.isRequired
};

export default ProgramUploadModal;
