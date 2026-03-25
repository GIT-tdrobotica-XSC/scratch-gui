import React, {useState, useEffect} from 'react';
import PropTypes from 'prop-types';
import styles from './device-toast.css';

let toastId = 0;

const DeviceToast = ({vm}) => {
    const [toasts, setToasts] = useState([]);

    const addToast = (type, message) => {
        const id = ++toastId;
        setToasts(prev => [...prev, {id, type, message, exiting: false}]);

        // Inicia salida antes de remover para animar
        setTimeout(() => {
            setToasts(prev => prev.map(t => t.id === id ? {...t, exiting: true} : t));
        }, 3000);

        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3250);
    };

    useEffect(() => {
        if (!vm) return;

        const handleConnected = () => addToast('connected', 'Dispositivo conectado');
        const handleDisconnected = () => addToast('disconnected', 'Dispositivo desconectado');

        vm.on('PERIPHERAL_CONNECTED', handleConnected);
        vm.on('PERIPHERAL_DISCONNECTED', handleDisconnected);

        return () => {
            vm.removeListener('PERIPHERAL_CONNECTED', handleConnected);
            vm.removeListener('PERIPHERAL_DISCONNECTED', handleDisconnected);
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
                        {toast.type === 'connected' ? '✓' : '○'}
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
