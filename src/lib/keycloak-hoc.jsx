import React from 'react';
import keycloak from './keycloak';
import AuthLoading from '../components/auth-loading/auth-loading.jsx';

// Inicializar Keycloak una sola vez a nivel de módulo
// Evita que múltiples montajes del componente llamen init() más de una vez
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
        }

        componentDidMount () {
            initKeycloak()
                .then(authenticated => {
                    if (authenticated) {
                        // Activar aviso de salida solo después de autenticarse
                        if (process.env.NODE_ENV === 'production') {
                            window.onbeforeunload = () => true;
                        }
                        this.setState({initialized: true});
                    } else {
                        // No autenticado: Keycloak debería haber redirigido, pero por si acaso
                        keycloak.login();
                    }
                })
                .catch(() => {
                    // Reset para permitir reintento en el próximo montaje
                    keycloakInitPromise = null;
                    keycloak.login();
                });
        }

        render () {
            if (!this.state.initialized) {
                return <AuthLoading />;
            }
            return <WrappedComponent {...this.props} />;
        }
    }

    KeycloakWrapper.displayName = `KeycloakHOC(${WrappedComponent.displayName || WrappedComponent.name})`;

    return KeycloakWrapper;
};

export default KeycloakHOC;
