import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import styles from './remote-control-modal.css';

/**
 * Control remoto en pantalla: una cruceta y cuatro botones de acción que se
 * envían al robot como un SENSOR, no como una orden.
 *
 * Esa distinción es lo que hace que el control funcione también con el programa
 * autónomo corriendo: el programa de la placa sigue siendo el único dueño de
 * los motores; esto solo actualiza algo que el programa consulta si quiere, con
 * el bloque «Control remoto: [botón] presionado?».
 *
 * SEGURIDAD: mientras el modal está abierto, el peripheral manda un latido
 * cada 200 ms. Si se cierra el modal, se pierde el enlace, o el navegador pasa
 * a segundo plano, los refrescos paran y el firmware da los botones por
 * sueltos a los 500 ms. Sin eso, cerrar una pestaña con «avanzar» pulsado
 * dejaría al robot embistiendo una pared.
 */

/** Los 8 botones, en el orden de índice que espera la placa. */
const BUTTONS = [
    { index: 0, glyph: '▲', label: 'Arriba', keys: ['ArrowUp', 'KeyW'], area: 'up' },
    { index: 1, glyph: '▼', label: 'Abajo', keys: ['ArrowDown', 'KeyS'], area: 'down' },
    { index: 2, glyph: '◀', label: 'Izquierda', keys: ['ArrowLeft', 'KeyA'], area: 'left' },
    { index: 3, glyph: '▶', label: 'Derecha', keys: ['ArrowRight', 'KeyD'], area: 'right' },
    { index: 4, glyph: 'A', label: 'Botón A', keys: ['KeyZ'], area: 'a' },
    { index: 5, glyph: 'B', label: 'Botón B', keys: ['KeyX'], area: 'b' },
    { index: 6, glyph: 'C', label: 'Botón C', keys: ['KeyC'], area: 'c' },
    { index: 7, glyph: 'D', label: 'Botón D', keys: ['KeyV'], area: 'd' }
];

/** code del teclado -> índice de botón, para las teclas físicas. */
const KEY_TO_INDEX = BUTTONS.reduce((acc, b) => {
    b.keys.forEach(k => { acc[k] = b.index; });
    return acc;
}, {});

const RemoteControlModal = ({ peripheral, deviceName, onClose }) => {
    // Un Set con los índices presionados. Se guarda en estado para poder
    // pintarlos, y el peripheral lleva su propia máscara para el envío.
    const [pressed, setPressed] = useState(() => new Set());
    const pressedRef = useRef(pressed);
    pressedRef.current = pressed;

    const press = useCallback((index, isDown) => {
        setPressed(prev => {
            const next = new Set(prev);
            if (isDown) {
                if (next.has(index)) return prev;
                next.add(index);
            } else {
                if (!next.has(index)) return prev;
                next.delete(index);
            }
            return next;
        });
        peripheral.setRemoteButton(index, isDown);
    }, [peripheral]);

    /** Suelta todo. Se usa al perder el foco y al cerrar. */
    const releaseAll = useCallback(() => {
        pressedRef.current.forEach(i => peripheral.setRemoteButton(i, false));
        setPressed(new Set());
    }, [peripheral]);

    useEffect(() => {
        peripheral.startRemote();

        const onKeyDown = e => {
            const index = KEY_TO_INDEX[e.code];
            if (index === undefined) return;
            // Sin esto, las flechas harían scroll de la página y las letras
            // podrían llegar al área de bloques.
            e.preventDefault();
            if (e.repeat) return;
            press(index, true);
        };
        const onKeyUp = e => {
            const index = KEY_TO_INDEX[e.code];
            if (index === undefined) return;
            e.preventDefault();
            press(index, false);
        };
        // Si el navegador pierde el foco (alt-tab), no llegan los keyup: sin
        // esto un botón se quedaría pegado.
        const onBlur = () => releaseAll();

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            peripheral.stopRemote();
        };
    }, [peripheral, press, releaseAll]);

    const renderButton = btn => {
        const isDown = pressed.has(btn.index);
        const hint = btn.keys[0].replace('Arrow', '').replace('Key', '');
        // El estado pulsado usa la clase `pressed`, NO `down`: el botón ▼ ya
        // usa `down` como su área en la rejilla de la cruceta, y compartir
        // nombre lo dejaba pintado como pulsado de forma permanente.
        return (
            <button
                key={btn.index}
                className={`${styles.padButton} ${styles[btn.area]} ${isDown ? styles.pressed : ''}`}
                title={`${btn.label} · tecla ${hint}`}
                aria-label={btn.label}
                aria-pressed={isDown}
                onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); press(btn.index, true); }}
                onPointerUp={() => press(btn.index, false)}
                onPointerCancel={() => press(btn.index, false)}
                onContextMenu={e => e.preventDefault()}
            >
                <span className={styles.glyph}>{btn.glyph}</span>
                <span className={styles.keyHint}>{hint}</span>
            </button>
        );
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2 className={styles.title}>{'🎮 Control remoto'}</h2>
                    <button className={styles.closeButton} onClick={onClose}>{'✕'}</button>
                </div>

                <p className={styles.subtitle}>
                    {`Manda botones a ${deviceName}. Úsalos en tus bloques con `}
                    <strong>{'«Control remoto: [botón] presionado?»'}</strong>
                </p>

                <div className={styles.pad}>
                    <div className={styles.dpad}>
                        {BUTTONS.slice(0, 4).map(renderButton)}
                    </div>
                    <div className={styles.actions}>
                        {BUTTONS.slice(4).map(renderButton)}
                    </div>
                </div>

                <div className={styles.footer}>
                    <p className={styles.hint}>
                        {'También sirven las flechas del teclado y las teclas Z X C V.'}
                    </p>
                    <p className={styles.safety}>
                        {'Al cerrar esta ventana el robot suelta todos los botones.'}
                    </p>
                </div>
            </div>
        </div>
    );
};

RemoteControlModal.propTypes = {
    peripheral: PropTypes.object.isRequired,
    deviceName: PropTypes.string,
    onClose: PropTypes.func.isRequired
};

RemoteControlModal.defaultProps = {
    deviceName: 'tu robot'
};

export default RemoteControlModal;
