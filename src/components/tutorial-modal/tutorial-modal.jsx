import React, {useState, useEffect} from 'react';
import PropTypes from 'prop-types';
import styles from './tutorial-modal.css';

const BASE_STEPS = [
    {
        icon: '🚀',
        title: '¡Bienvenido a PlayCode!',
        description: 'Tu entorno de programación visual para controlar dispositivos electrónicos. ' +
            'En los siguientes pasos aprenderás lo esencial para comenzar a programar.',
        targetSelector: null
    },
    {
        icon: '🔌',
        title: 'Panel de Dispositivos',
        description: 'En el panel de la izquierda encontrarás tu dispositivo (PlayIoT o PlayMe). ' +
            'Haz clic en "Conectar" y selecciona el puerto USB de tu placa para comenzar a enviar comandos.',
        targetSelector: '[data-tutorial="left-panel"]'
    },
    {
        icon: '🧩',
        title: 'Los Bloques',
        description: 'Aquí encontrarás todas las categorías de bloques disponibles. ' +
            'Selecciona una categoría para ver sus bloques y arrástralos al área de trabajo para programar.',
        targetSelector: '.blocklyToolboxDiv'
    },
    {
        icon: '▶',
        title: 'Área de Trabajo',
        description: 'Este es tu espacio de programación. ' +
            'Arrastra y conecta bloques para crear tu programa. ' +
            'Usa la bandera verde para ejecutarlo y el octágono rojo para detenerlo.',
        targetSelector: '[data-tutorial="editor"]'
    },
    {
        icon: '⬇',
        title: 'Actualización de Firmware',
        description: 'Si tu placa necesita actualización, haz clic en "Actualizar Firmware" en el panel de dispositivos a la izquierda. ' +
            'El proceso descarga e instala automáticamente la última versión disponible. ' +
            'Asegúrate de tener el dispositivo conectado antes de iniciar la actualización.',
        targetSelector: '[data-tutorial="left-panel"]'
    }
];

const ZOOM_STEP = {
    icon: '🔍',
    title: 'Ajusta el zoom de tu pantalla',
    description: 'Tu pantalla es pequeña y parte de la interfaz puede quedar cortada. ' +
        'Presiona Ctrl + - (Windows) o ⌘ + - (Mac) para reducir el zoom del navegador hasta que todo sea visible. ' +
        'El navegador recordará este ajuste para la próxima vez.',
    targetSelector: null
};

const buildSteps = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1400) {
        return [BASE_STEPS[0], ZOOM_STEP, ...BASE_STEPS.slice(1)];
    }
    return BASE_STEPS;
};

const STEPS = buildSteps();

const ZOOM_THRESHOLD = 1200;

const TutorialModal = ({step, onNext, onSkip}) => {
    const current = STEPS[step];
    const isLastStep = step === STEPS.length - 1;
    const isZoomStep = current === ZOOM_STEP;
    const [zoomWarning, setZoomWarning] = useState(false);
    const [spotlightRect, setSpotlightRect] = useState(null);

    useEffect(() => {
        if (!current.targetSelector) {
            setSpotlightRect(null);
            return;
        }
        const el = document.querySelector(current.targetSelector);
        if (el) {
            setSpotlightRect(el.getBoundingClientRect());
        } else {
            setSpotlightRect(null);
        }
    }, [step]);

    const handleNext = () => {
        if (isZoomStep && typeof window !== 'undefined' && window.innerWidth < ZOOM_THRESHOLD) {
            setZoomWarning(true);
            return;
        }
        setZoomWarning(false);
        onNext();
    };

    return (
        <div className={`${styles.overlay} ${spotlightRect ? styles.overlaySpotlight : ''}`}>
            {spotlightRect && (
                <div
                    className={styles.spotlight}
                    style={{
                        left: `${spotlightRect.left}px`,
                        top: `${spotlightRect.top}px`,
                        width: `${spotlightRect.width}px`,
                        height: `${spotlightRect.height}px`
                    }}
                />
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
                    {zoomWarning && (
                        <p className={styles.zoomWarning}>
                            {'Tu pantalla sigue siendo pequeña. Presiona Ctrl + - hasta que todo sea visible y luego haz clic en "Listo".'}
                        </p>
                    )}
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
                        {!isZoomStep && (
                            <button
                                className={styles.skipButton}
                                onClick={onSkip}
                            >
                                {'Omitir'}
                            </button>
                        )}
                        <button
                            className={styles.nextButton}
                            onClick={handleNext}
                        >
                            {isLastStep ? '¡Comenzar!' : isZoomStep ? 'Listo, ajusté el zoom →' : 'Siguiente →'}
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
