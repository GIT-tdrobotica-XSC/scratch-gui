import React, {useState, useEffect, useRef} from 'react';
import PropTypes from 'prop-types';
import styles from './device-toast.css';

const DeviceToast = ({vm}) => {
    const [toasts, setToasts] = useState([]);
    const toastIdRef = useRef(0);
    const timersRef = useRef([]);

    const addToast = (type, message) => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev, {id, type, message, exiting: false}]);

        // Inicia salida antes de remover para animar
        const t1 = setTimeout(() => {
            setToasts(prev => prev.map(t => t.id === id ? {...t, exiting: true} : t));
        }, 3000);
        const t2 = setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3250);
        timersRef.current.push(t1, t2);
    };

    useEffect(() => {
        return () => {
            timersRef.current.forEach(clearTimeout);
        };
    }, []);

    useEffect(() => {
        if (!vm) return;

        const handleConnected = () => addToast('connected', 'Dispositivo conectado');
        const handleDisconnected = () => addToast('disconnected', 'Dispositivo desconectado');
        const handleReconnecting = () => addToast('reconnecting', 'Reconectando dispositivo…');

        vm.on('PERIPHERAL_CONNECTED', handleConnected);
        vm.on('PERIPHERAL_DISCONNECTED', handleDisconnected);
        vm.on('PERIPHERAL_RECONNECTING', handleReconnecting);

        return () => {
            vm.removeListener('PERIPHERAL_CONNECTED', handleConnected);
            vm.removeListener('PERIPHERAL_DISCONNECTED', handleDisconnected);
            vm.removeListener('PERIPHERAL_RECONNECTING', handleReconnecting);
        };
    }, [vm]);

    if (toasts.length === 0) return null;

    return (
        <div className={styles.container}>
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`${styles.toast} ${styles[toast.type]} ${toast.exiting ? styles.exiting : ''}`}
                >
                    <span className={styles.icon}>
                        {toast.type === 'connected' ? '✓' : (toast.type === 'reconnecting' ? '⟳' : '○')}
                    </span>
                    {toast.message}
                </div>
            ))}
        </div>
    );
};

DeviceToast.propTypes = {
    vm: PropTypes.object
};

export default DeviceToast;
