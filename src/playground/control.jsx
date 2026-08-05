/**
 * Mando suelto para PlayGo — pensado para el celular.
 *
 * Es una página APARTE del editor a propósito. El editor de bloques en un
 * teléfono es pesado e inservible, y para manejar un robot no hace falta nada
 * de él: sólo un enlace Bluetooth y ocho botones. Esta página abre su propia
 * conexión, sin pasar por la pestaña Dispositivos.
 *
 * Lo único que manda son los botones del control (`remoteKeys`), que en la
 * placa son un SENSOR: el programa que el niño subió sigue siendo el dueño del
 * hardware. Por eso este mando convive con el modo autónomo sin pelearse por
 * los motores.
 *
 * No importa `scratch-vm` entero: sólo el transporte BLE (que no tiene
 * dependencias) y el protocolo del control (compartido con el editor, para que
 * no puedan divergir).
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom';

import PlayGoBLE from 'scratch-vm/src/extensions/playgo/playgo-ble';
import RemoteControl, {REMOTE_BUTTONS, KEY_MAP} from 'scratch-vm/src/extensions/common/remote-control';

import styles from './control.css';

/** Botón del mando: se pinta y reporta pulsar/soltar por punteros. */
const PadButton = ({button, pressed, disabled, onPress, onRelease, className}) => {
    // Se usan eventos de puntero y no click: un click sólo llega al soltar, y
    // aquí hace falta saber que el botón se está MANTENIENDO pulsado.
    const handleDown = useCallback(e => {
        e.preventDefault();
        if (disabled) return;
        // Captura: si el dedo se desliza fuera del botón, el "soltar" sigue
        // llegando aquí. Sin esto, un dedo que resbala deja el robot avanzando.
        if (e.currentTarget.setPointerCapture) {
            try {
                e.currentTarget.setPointerCapture(e.pointerId);
            } catch (err) { /* navegador sin captura: el onPointerLeave cubre */ }
        }
        onPress(button.index);
    }, [button.index, disabled, onPress]);

    const handleUp = useCallback(e => {
        e.preventDefault();
        onRelease(button.index);
    }, [button.index, onRelease]);

    return (
        <button
            className={`${className} ${pressed ? styles.pressed : ''}`}
            disabled={disabled}
            aria-label={button.label}
            aria-pressed={pressed}
            onPointerDown={handleDown}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            onPointerLeave={handleUp}
            onContextMenu={e => e.preventDefault()}
        >
            {button.glyph}
        </button>
    );
};

const byId = id => REMOTE_BUTTONS.find(b => b.id === id);

const Control = () => {
    const [status, setStatus] = useState('idle'); // idle | connecting | ready | error
    const [error, setError] = useState(null);
    const [deviceName, setDeviceName] = useState(null);
    const [mask, setMask] = useState(0);

    const bleRef = useRef(null);
    const remoteRef = useRef(null);

    // Un solo sitio que refresca el pintado tras cambiar la máscara.
    const syncMask = useCallback(() => {
        if (remoteRef.current) setMask(remoteRef.current.mask);
    }, []);

    const handlePress = useCallback(index => {
        if (!remoteRef.current || !remoteRef.current.active) return;
        remoteRef.current.setButton(index, true);
        syncMask();
    }, [syncMask]);

    const handleRelease = useCallback(index => {
        if (!remoteRef.current) return;
        remoteRef.current.setButton(index, false);
        syncMask();
    }, [syncMask]);

    const connect = useCallback(async () => {
        setStatus('connecting');
        setError(null);
        try {
            const ble = new PlayGoBLE();
            await ble.connect();
            bleRef.current = ble;

            const remote = new RemoteControl(line => ble.write(line));
            remoteRef.current = remote;
            remote.start();

            setDeviceName((ble.device && ble.device.name) || 'PlayGo');
            setStatus('ready');
        } catch (e) {
            // Cancelar el selector del navegador no es un fallo que merezca
            // pantalla de error: se vuelve al estado inicial y ya.
            if (e && e.name === 'NotFoundError') {
                setStatus('idle');
                return;
            }
            setError(e && e.message ? e.message : 'No se pudo conectar');
            setStatus('error');
        }
    }, []);

    const disconnect = useCallback(async () => {
        if (remoteRef.current) {
            remoteRef.current.stop();
            remoteRef.current = null;
        }
        if (bleRef.current) {
            try {
                await bleRef.current.disconnect();
            } catch (e) { /* ya estaba caído */ }
            bleRef.current = null;
        }
        setMask(0);
        setDeviceName(null);
        setStatus('idle');
    }, []);

    // Teclado físico, para que un computador también sirva de mando.
    useEffect(() => {
        if (status !== 'ready') return undefined;

        const onKeyDown = e => {
            const index = KEY_MAP[e.code];
            if (index === undefined || e.repeat) return;
            e.preventDefault();
            handlePress(index);
        };
        const onKeyUp = e => {
            const index = KEY_MAP[e.code];
            if (index === undefined) return;
            e.preventDefault();
            handleRelease(index);
        };
        // Perder el foco (cambiar de pestaña, entrar una llamada) suelta todo:
        // el "soltar" de una tecla no llega si la ventana ya no escucha, y un
        // botón que se queda pegado deja el robot andando solo contra la pared.
        const onBlur = () => {
            if (remoteRef.current) {
                remoteRef.current.releaseAll();
                syncMask();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onBlur);
        };
    }, [status, handlePress, handleRelease, syncMask]);

    // Al cerrar la pestaña, soltar los botones mientras el enlace aún vive.
    useEffect(() => {
        const onUnload = () => {
            if (remoteRef.current) remoteRef.current.stop();
        };
        window.addEventListener('pagehide', onUnload);
        return () => window.removeEventListener('pagehide', onUnload);
    }, []);

    // Mantener la pantalla encendida mientras se juega: un teléfono que se
    // apaga a los 30 s corta el control en mitad de una partida.
    useEffect(() => {
        if (status !== 'ready' || !navigator.wakeLock) return undefined;
        let lock = null;
        let cancelled = false;
        navigator.wakeLock.request('screen')
            .then(l => {
                if (cancelled) l.release();
                else lock = l;
            })
            .catch(() => { /* sin permiso: se vive igual */ });
        return () => {
            cancelled = true;
            if (lock) lock.release().catch(() => {});
        };
    }, [status]);

    const ready = status === 'ready';
    const supported = typeof navigator !== 'undefined' && !!navigator.bluetooth;

    return (
        <div className={styles.page}>
            <header className={styles.bar}>
                <span className={styles.brand}>{'PlayGo · Mando'}</span>
                <span className={styles.state}>
                    <span
                        className={styles.dot}
                        data-on={ready ? 'true' : 'false'}
                    />
                    {ready ? deviceName : 'Sin conectar'}
                </span>
                {ready && (
                    <button
                        className={styles.linkButton}
                        onClick={disconnect}
                    >
                        {'Desconectar'}
                    </button>
                )}
            </header>

            {!ready && (
                <div className={styles.cover}>
                    {!supported && (
                        <div className={styles.notice}>
                            <p className={styles.noticeTitle}>{'Este navegador no puede conectarse'}</p>
                            <p>{'Necesitas Chrome en Android o en el computador. Safari (iPhone y iPad) todavía no permite conectar robots por Bluetooth.'}</p>
                        </div>
                    )}

                    {supported && (
                        <>
                            <div className={styles.hero}>{'🎮'}</div>
                            <h1 className={styles.title}>{'Maneja tu robot'}</h1>
                            <p className={styles.lead}>
                                {'Enciende tu PlayGo y pulsa el botón. No necesitas tener el programa abierto: el robot sigue con lo que ya le subiste.'}
                            </p>
                            <button
                                className={styles.connectButton}
                                disabled={status === 'connecting'}
                                onClick={connect}
                            >
                                {status === 'connecting' ? 'Buscando…' : 'Conectar por Bluetooth'}
                            </button>
                            {error && (
                                <p className={styles.error}>{error}</p>
                            )}
                            <p className={styles.hint}>
                                {'En el computador también puedes usar las flechas y las teclas Z X C V.'}
                            </p>
                        </>
                    )}
                </div>
            )}

            <main className={styles.pad}>
                <div className={styles.dpad}>
                    {['up', 'left', 'right', 'down'].map(id => {
                        const button = byId(id);
                        return (
                            <PadButton
                                key={id}
                                button={button}
                                className={`${styles.padButton} ${styles[id]}`}
                                disabled={!ready}
                                pressed={(mask & (1 << button.index)) !== 0}
                                onPress={handlePress}
                                onRelease={handleRelease}
                            />
                        );
                    })}
                    <span className={styles.dpadCenter} />
                </div>

                <div className={styles.actions}>
                    {['a', 'b', 'c', 'd'].map(id => {
                        const button = byId(id);
                        return (
                            <PadButton
                                key={id}
                                button={button}
                                className={`${styles.actionButton} ${styles[`action${id.toUpperCase()}`]}`}
                                disabled={!ready}
                                pressed={(mask & (1 << button.index)) !== 0}
                                onPress={handlePress}
                                onRelease={handleRelease}
                            />
                        );
                    })}
                </div>
            </main>
        </div>
    );
};

const appTarget = document.createElement('div');
appTarget.id = 'app';
document.body.appendChild(appTarget);

ReactDOM.render(<Control />, appTarget);
