import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import Box from '../box/box.jsx';

import styles from './connection-modal.css';

class PeripheralTile extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleConnecting'
        ]);
    }
    handleConnecting () {
        this.props.onConnecting(this.props.peripheralId);
    }
    render () {
        return (
            <Box className={styles.peripheralTile}>
                <Box className={styles.peripheralTileName}>
                    <img
                        className={styles.peripheralTileImage}
                        src={this.props.connectionSmallIconURL}
                    />
                    <Box className={styles.peripheralTileNameWrapper}>
                        <Box className={styles.peripheralTileNameLabel}>
                            <FormattedMessage
                                defaultMessage="Device name"
                                description="Label for field showing the device name"
                                id="gui.connection.peripheral-name-label"
                            />
                        </Box>
                        <Box className={styles.peripheralTileNameText}>
                            {this.props.name}
                        </Box>
                    </Box>
                </Box>
                <Box className={styles.peripheralTileWidgets}>
                    <button
                        onClick={this.handleConnecting}
                    >
                        <FormattedMessage
                            defaultMessage="Connect"
                            description="Button to start connecting to a specific device"
                            id="gui.connection.connect"
                        />
                    </button>
                </Box>
            </Box>
        );
    }
}

PeripheralTile.propTypes = {
    connectionSmallIconURL: PropTypes.string,
    name: PropTypes.string,
    onConnecting: PropTypes.func,
    peripheralId: PropTypes.string,
    rssi: PropTypes.number
};

export default PeripheralTile;
