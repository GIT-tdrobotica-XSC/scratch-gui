import React from 'react';
import keycloak from './keycloak';
import AuthLoading from '../components/auth-loading/auth-loading.jsx';
import styles from '../components/auth-loading/keycloak-user-bar.css';

// Inicializar Keycloak una sola vez a nivel de módulo
let keycloakInitPromise = null;

const initKeycloak = () => {
    if (!keycloakInitPromise) {
        keycloakInitPromise = keycloak.init({
            onLoad: 'login-required',
            checkLoginIframe: false,
            pkceMethod: 'S256'
        });
    }
    return keycloakInitPromise;
};

const KeycloakHOC = function (WrappedComponent) {
    class KeycloakWrapper extends React.Component {
        constructor (props) {
            super(props);
            this.state = {
                initialized: false
            };
            this.tokenRefreshInterval = null;
            this.handleLogout = this.handleLogout.bind(this);
        }

        componentDidMount () {
            initKeycloak()
                .then(authenticated => {
                    if (authenticated) {
                        if (process.env.NODE_ENV === 'production') {
                            window.onbeforeunload = () => true;
                        }
                        this.setState({initialized: true});
                        this.startTokenRefresh();
                    } else {
                        keycloak.login();
                    }
                })
                .catch(() => {
                    keycloakInitPromise = null;
                    keycloak.login();
                });
        }

        componentWillUnmount () {
            if (this.tokenRefreshInterval) {
                clearInterval(this.tokenRefreshInterval);
            }
        }

        startTokenRefresh () {
            // Refresca el token cada 60s si expira en menos de 70s
            this.tokenRefreshInterval = setInterval(() => {
                keycloak.updateToken(70).catch(() => {
                    // Si no se pudo refrescar (sesión expirada), redirigir al login
                    keycloak.login();
                });
            }, 60000);
        }

        handleLogout () {
            if (this.tokenRefreshInterval) {
                clearInterval(this.tokenRefreshInterval);
            }
            keycloak.logout({
                redirectUri: window.location.origin
            });
        }

        render () {
            if (!this.state.initialized) {
                return <AuthLoading />;
            }

            const token = keycloak.tokenParsed || {};
            const username = token.preferred_username || token.email || '';

            return (
                <React.Fragment>
                    <WrappedComponent {...this.props} />
                    <div className={styles.userBar}>
                        {username && (
                            <span className={styles.username}>{username}</span>
                        )}
                        <button
                            className={styles.logoutButton}
                            onClick={this.handleLogout}
                            title="Cerrar sesión"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            <span>{'Cerrar sesión'}</span>
                        </button>
                    </div>
                </React.Fragment>
            );
        }
    }

    KeycloakWrapper.displayName = `KeycloakHOC(${WrappedComponent.displayName || WrappedComponent.name})`;

    return KeycloakWrapper;
};

export default KeycloakHOC;
