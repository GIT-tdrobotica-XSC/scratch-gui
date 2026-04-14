import React, {useState, useEffect} from 'react';
import PropTypes from 'prop-types';
import styles from './tutorial-modal.css';

const BASE_STEPS = [
    {
        icon: '🚀',
        title: '¡Bienvenido a PlayCode!',
        description: 'Un entorno de programación visual diseñado para aprender creando. ' +
            'A través de este breve recorrido descubrirás las principales herramientas de la plataforma ' +
            'y cómo utilizarlas para desarrollar tus primeros programas.',
        targetSelector: null
    },
    {
        icon: '🔌',
        title: 'Panel de Dispositivos',
        description: 'En la parte superior encontrarás el Escenario, donde podrás ver cómo interactúan ' +
            'tus objetos y dispositivos. Debajo encontrarás el panel de configuración, donde podrás ' +
            'agregar y conectar dispositivos como PlayIoT o PlayMe para enviar comandos y empezar a programar.',
        targetSelector: '[data-tutorial="left-panel"]'
    },
    {
        icon: '🧩',
        title: 'Los Bloques',
        description: 'Aquí encontrarás todas las categorías de bloques para crear programas increíbles. ' +
            '¡Haz clic en una categoría, arrastra los bloques al área de trabajo y descubre cómo dar vida a tus proyectos!',
        targetSelector: '.blocklyToolboxDiv'
    },
    {
        icon: '▶',
        title: 'Área de Trabajo',
        description: 'Este es el espacio donde crearás tus programas. ' +
            'Arrastra los bloques y conéctalos para formar instrucciones. ' +
            'Usa la bandera verde para ejecutar tu programa y el botón rojo para detenerlo.',
        targetSelector: '[data-tutorial="editor"]'
    },
    {
        icon: '🎉',
        title: '¡Todo listo para programar!',
        description: 'Ahora ya conoces las principales herramientas de PlayCode. ' +
            'Crea programas, conecta dispositivos y dale vida a tus proyectos de forma fácil y divertida.',
        targetSelector: null
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
    const [dontShowAgain, setDontShowAgain] = useState(false);

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
        onNext(dontShowAgain);
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
                    <label className={styles.dontShowLabel}>
                        <input
                            checked={dontShowAgain}
                            className={styles.dontShowCheck}
                            type="checkbox"
                            onChange={e => setDontShowAgain(e.target.checked)}
                        />
                        {'No mostrar de nuevo'}
                    </label>
                    <div className={styles.footerRight}>
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
                                    onClick={() => onSkip(dontShowAgain)}
                                >
                                    {'Omitir'}
                                </button>
                            )}
                            <button
                                className={styles.nextButton}
                                onClick={handleNext}
                            >
                                {isLastStep ? '¡Comienza a programar!' : isZoomStep ? 'Listo, ajusté el zoom →' : 'Siguiente →'}
                            </button>
                        </div>
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
