import React from 'react';
import TutorialModal, {STEPS} from '../components/tutorial-modal/tutorial-modal.jsx';

const TutorialHOC = function (WrappedComponent) {
    class TutorialWrapper extends React.Component {
        constructor (props) {
            super(props);
            this.state = {
                visible: true,
                step: 0
            };
            this.handleNext = this.handleNext.bind(this);
            this.handleSkip = this.handleSkip.bind(this);
        }

        handleNext () {
            const {step} = this.state;
            if (step < STEPS.length - 1) {
                this.setState({step: step + 1});
            } else {
                this.setState({visible: false});
            }
        }

        handleSkip () {
            this.setState({visible: false});
        }

        render () {
            const {visible, step} = this.state;
            return (
                <React.Fragment>
                    <WrappedComponent {...this.props} />
                    {visible && (
                        <TutorialModal
                            step={step}
                            onNext={this.handleNext}
                            onSkip={this.handleSkip}
                        />
                    )}
                </React.Fragment>
            );
        }
    }

    TutorialWrapper.displayName = `TutorialHOC(${WrappedComponent.displayName || WrappedComponent.name})`;

    return TutorialWrapper;
};

export default TutorialHOC;
