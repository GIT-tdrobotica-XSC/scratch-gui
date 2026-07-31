import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import stopAllIcon from './icon--stop-all.svg';
import styles from './stop-all.css';

const StopAllComponent = function (props) {
    const {
        active,
        className,
        disabled,
        onClick,
        title,
        ...componentProps
    } = props;
    return (
        <img
            className={classNames(
                className,
                styles.stopAll,
                {
                    [styles.isActive]: active,
                    [styles.isDisabled]: disabled
                }
            )}
            draggable={false}
            src={stopAllIcon}
            title={title}
            onClick={disabled ? undefined : onClick}
            {...componentProps}
        />
    );
};

StopAllComponent.propTypes = {
    active: PropTypes.bool,
    className: PropTypes.string,
    disabled: PropTypes.bool,
    onClick: PropTypes.func.isRequired,
    title: PropTypes.string
};

StopAllComponent.defaultProps = {
    active: false,
    disabled: false,
    title: 'Stop'
};

export default StopAllComponent;
