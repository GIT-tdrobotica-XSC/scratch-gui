import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import GreenFlag from '../green-flag/green-flag.jsx';
import StopAll from '../stop-all/stop-all.jsx';
import TurboMode from '../turbo-mode/turbo-mode.jsx';

import styles from './controls.css';

const messages = defineMessages({
    goTitle: {
        id: 'gui.controls.go',
        defaultMessage: 'Go',
        description: 'Green flag button title'
    },
    stopTitle: {
        id: 'gui.controls.stop',
        defaultMessage: 'Stop',
        description: 'Stop button title'
    },
    // El tooltip dice QUE HACER, no solo que esta deshabilitado: un control
    // apagado sin explicacion se lee como que la aplicacion se rompio.
    programRunningTitle: {
        id: 'gui.controls.programRunning',
        defaultMessage: 'Tu robot está corriendo su propio programa. Para probar en vivo, ' +
            'pulsa «Detener programa» en la pestaña Dispositivos.',
        description: 'Tooltip when the board is running its own compiled program'
    }
});

const Controls = function (props) {
    const {
        active,
        className,
        intl,
        onGreenFlagClick,
        onStopAllClick,
        programRunning,
        turbo,
        ...componentProps
    } = props;
    const disabledTitle = intl.formatMessage(messages.programRunningTitle);
    return (
        <div
            className={classNames(styles.controlsContainer, className)}
            {...componentProps}
        >
            <GreenFlag
                active={active}
                disabled={programRunning}
                title={programRunning ? disabledTitle : intl.formatMessage(messages.goTitle)}
                onClick={onGreenFlagClick}
            />
            <StopAll
                active={active}
                disabled={programRunning}
                title={programRunning ? disabledTitle : intl.formatMessage(messages.stopTitle)}
                onClick={onStopAllClick}
            />
            {turbo ? (
                <TurboMode />
            ) : null}
        </div>
    );
};

Controls.propTypes = {
    active: PropTypes.bool,
    className: PropTypes.string,
    intl: intlShape.isRequired,
    onGreenFlagClick: PropTypes.func.isRequired,
    onStopAllClick: PropTypes.func.isRequired,
    programRunning: PropTypes.bool,
    turbo: PropTypes.bool
};

Controls.defaultProps = {
    active: false,
    programRunning: false,
    turbo: false
};

export default injectIntl(Controls);
