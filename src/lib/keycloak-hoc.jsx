import React from 'react';
import keycloak from './keycloak';
import AuthLoading from '../components/auth-loading/auth-loading.jsx';

const KeycloakHOC = function (WrappedComponent) {
    class KeycloakWrapper extends React.Component {
        constructor (props) {
            super(props);
            this.state = {
                initialized: false
            };
        }

        componentDidMount () {
            keycloak
                .init({
                    onLoad: 'login-required',
                    checkLoginIframe: false
                })
                .then(() => {
                    this.setState({initialized: true});
                })
                .catch(() => {
                    // Si falla la inicialización, redirigir al login
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
