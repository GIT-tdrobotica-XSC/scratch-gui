import React, { useState } from 'react';
import UpdaterModal from './UpdaterModal.jsx';
import styles from './firmware-updater.module.css';

const FirmwareUpdaterButton = ({ vm }) => {
    const [showModal, setShowModal] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const handleClick = () => {
        setShowModal(true);
    };

    const handleClose = () => {
        if (!isUpdating) {
            setShowModal(false);
        }
    };

    return (
        <>
            <button
                className={styles.updaterButton}
                onClick={handleClick}
                title="Actualizar firmware del ESP32"
                disabled={isUpdating}
            >
                <span className={styles.icon}>⚙️</span>
                <span className={styles.text}>Actualizar Firmware</span>
            </button>

            {showModal && (
                <UpdaterModal
                    onClose={handleClose}
                    onUpdatingChange={setIsUpdating}
                />
            )}
        </>
    );
};

export default FirmwareUpdaterButton;