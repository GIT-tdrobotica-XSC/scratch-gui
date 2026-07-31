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
            'handleRunStop',
            'checkProgramRunning'
        ]);
        this.state = { localRunning: false, programRunning: false };
        this._programPoll = null;
    }
    componentDidMount () {
        if (this.props.vm) {
            this.props.vm.on('PROJECT_RUN_STOP', this.handleRunStop);
        }
        // Mientras una placa corre SU PROPIO programa ignora las ordenes en
        // vivo, asi que la bandera verde y el boton rojo no harian nada. En
        // vez de fallar en silencio (que parece que PlayCode se rompio), se
        // deshabilitan y el tooltip explica como recuperar el control.
        this._programPoll = setInterval(this.checkProgramRunning, 500);
    }
    componentWillUnmount () {
        if (this.props.vm) {
            this.props.vm.removeListener('PROJECT_RUN_STOP', this.handleRunStop);
        }
        if (this._programPoll) clearInterval(this._programPoll);
    }
    /**
     * ¿Hay alguna placa corriendo su propio programa? Se pregunta a todos los
     * periféricos, no solo a PlayGo, para que esto siga funcionando cuando
     * PlayIoT y PlayMe ganen el modo autónomo.
     */
    checkProgramRunning () {
        const extensions = this.props.vm && this.props.vm.runtime &&
            this.props.vm.runtime.peripheralExtensions;
        let running = false;
        if (extensions) {
            running = Object.keys(extensions).some(id => {
                const peripheral = extensions[id];
                return peripheral &&
                    typeof peripheral.isRunningProgram === 'function' &&
                    peripheral.isRunningProgram();
            });
        }
        if (running !== this.state.programRunning) {
            this.setState({ programRunning: running });
        }
    }
    // Safety net: if Redux state gets stuck, force-reset via direct VM event
    handleRunStop () {
        this.props.onSetRunning(false);
    }
    handleGreenFlagClick (e) {
        e.preventDefault();
        // Con la placa corriendo su programa, el modo en vivo esta apagado.
        if (this.state.programRunning) return;
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
        if (this.state.programRunning) return;
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
                programRunning={this.state.programRunning}
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
