import React from 'react';
import PropTypes from 'prop-types';
import styles from './tutorial-modal.css';

const STEPS = [
    {
        icon: '🚀',
        title: '¡Bienvenido a PlayCode!',
        description: 'Tu entorno de programación visual para controlar dispositivos electrónicos. ' +
            'En los siguientes pasos aprenderás lo esencial para comenzar a programar.',
        highlight: 'none'
    },
    {
        icon: '🔌',
        title: 'Panel de Dispositivos',
        description: 'En el panel de la derecha encontrarás tu dispositivo (PlayIoT o PlayMe). ' +
            'Haz clic en "Conectar" y selecciona el puerto USB de tu placa para comenzar a enviar comandos.',
        highlight: 'right'
    },
    {
        icon: '▶',
        title: 'Ejecutar tu Programa',
        description: 'En el área izquierda está la pantalla de ejecución. ' +
            'Usa la bandera verde para iniciar tu programa y el octágono rojo para detenerlo. ' +
            'Los resultados se verán en tiempo real.',
        highlight: 'left'
    },
    {
        icon: '⬇',
        title: 'Actualización de Firmware',
        description: 'Si tu placa necesita actualización, haz clic en "Actualizar Firmware" en el panel de dispositivos a la derecha. ' +
            'El proceso descarga e instala automáticamente la última versión disponible.',
        highlight: 'right'
    }
];

const TutorialModal = ({step, onNext, onSkip}) => {
    const current = STEPS[step];
    const isLastStep = step === STEPS.length - 1;

    return (
        <div className={styles.overlay}>
            {current.highlight !== 'none' && (
                <div className={`${styles.highlightBar} ${styles[`highlight${current.highlight.charAt(0).toUpperCase() + current.highlight.slice(1)}`]}`} />
            )}
            <div className={styles.modal}>
                <div className={styles.header}>
                    <span className={styles.headerTitle}>{'Tutorial de PlayCode'}</span>
                    <button
                        className={styles.closeButton}
                        onClick={onSkip}
                        title="Cerrar tutorial"
                    >
                        {'✕'}
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.iconWrapper}>
                        <span className={styles.icon}>{current.icon}</span>
                    </div>
                    <h2 className={styles.title}>{current.title}</h2>
                    <p className={styles.description}>{current.description}</p>
                </div>

                <div className={styles.footer}>
                    <div className={styles.stepDots}>
                        {STEPS.map((_, i) => (
                            <span
                                key={i}
                                className={i === step ? styles.dotActive : styles.dot}
                            />
                        ))}
                    </div>
                    <div className={styles.buttons}>
                        <button
                            className={styles.skipButton}
                            onClick={onSkip}
                        >
                            {'Omitir'}
                        </button>
                        <button
                            className={styles.nextButton}
                            onClick={onNext}
                        >
                            {isLastStep ? '¡Comenzar!' : 'Siguiente →'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

TutorialModal.propTypes = {
    step: PropTypes.number.isRequired,
    onNext: PropTypes.func.isRequired,
    onSkip: PropTypes.func.isRequired
};

export {STEPS};
export default TutorialModal;
