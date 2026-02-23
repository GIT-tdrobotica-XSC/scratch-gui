import React from 'react';
import scratchLogo from '../menu-bar/scratch-logo.svg';
import styles from './auth-loading.css';

const AuthLoading = () => (
    <div className={styles.container}>
        <img
            className={styles.logo}
            src={scratchLogo}
            alt="PlayCode"
        />
        <div className={styles.spinner} />
        <p className={styles.text}>{'Verificando sesión...'}</p>
    </div>
);

export default AuthLoading;
