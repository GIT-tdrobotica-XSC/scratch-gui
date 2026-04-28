import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {connect} from 'react-redux';

import ControlsComponent from '../components/controls/controls.jsx';
import {setRunningState} from '../reducers/vm-status';

class Controls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleGreenFlagClick',
            'handleStopAllClick',
            'handleRunStop'
        ]);
        this.state = { localRunning: false };
    }
    componentDidMount () {
        if (this.props.vm) {
            this.props.vm.on('PROJECT_RUN_STOP', this.handleRunStop);
        }
    }
    componentWillUnmount () {
        if (this.props.vm) {
            this.props.vm.removeListener('PROJECT_RUN_STOP', this.handleRunStop);
        }
    }
    // Safety net: if Redux state gets stuck, force-reset via direct VM event
    handleRunStop () {
        this.props.onSetRunning(false);
    }
    handleGreenFlagClick (e) {
        e.preventDefault();
        if (e.shiftKey) {
            this.props.vm.setTurboMode(!this.props.turbo);
        } else {
            if (!this.props.isStarted) {
                this.props.vm.start();
            }
            this.props.vm.greenFlag();
        }
    }
    handleStopAllClick (e) {
        e.preventDefault();
        this.props.vm.stopAll();
        // Safety net: force-reset running state after short delay
        setTimeout(() => this.props.onSetRunning(false), 150);
    }
    render () {
        const {
            vm, // eslint-disable-line no-unused-vars
            isStarted, // eslint-disable-line no-unused-vars
            onSetRunning, // eslint-disable-line no-unused-vars
            projectRunning,
            turbo,
            ...props
        } = this.props;
        return (
            <ControlsComponent
                {...props}
                active={projectRunning}
                turbo={turbo}
                onGreenFlagClick={this.handleGreenFlagClick}
                onStopAllClick={this.handleStopAllClick}
            />
        );
    }
}

Controls.propTypes = {
    isStarted: PropTypes.bool.isRequired,
    onSetRunning: PropTypes.func.isRequired,
    projectRunning: PropTypes.bool.isRequired,
    turbo: PropTypes.bool.isRequired,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = state => ({
    isStarted: state.scratchGui.vmStatus.running,
    projectRunning: state.scratchGui.vmStatus.running,
    turbo: state.scratchGui.vmStatus.turbo
});

const mapDispatchToProps = dispatch => ({
    onSetRunning: running => dispatch(setRunningState(running))
});

export default connect(mapStateToProps, mapDispatchToProps)(Controls);
