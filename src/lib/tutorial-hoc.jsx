import React from 'react';
import TutorialModal, {STEPS} from '../components/tutorial-modal/tutorial-modal.jsx';

const STORAGE_KEY = 'playcode_tutorial_dismissed';

const TutorialHOC = function (WrappedComponent) {
    class TutorialWrapper extends React.Component {
        constructor (props) {
            super(props);
            let dismissed = false;
            try { dismissed = localStorage.getItem(STORAGE_KEY) === 'true'; } catch (e) { /* restricted context */ }
            this.state = {
                visible: !dismissed,
                step: 0
            };
            this.handleNext = this.handleNext.bind(this);
            this.handleSkip = this.handleSkip.bind(this);
        }

        handleNext (dontShowAgain) {
            const {step} = this.state;
            if (dontShowAgain) {
                localStorage.setItem(STORAGE_KEY, 'true');
            }
            if (step < STEPS.length - 1) {
                this.setState({step: step + 1});
            } else {
                this.setState({visible: false});
            }
        }

        handleSkip (dontShowAgain) {
            if (dontShowAgain) {
                localStorage.setItem(STORAGE_KEY, 'true');
            }
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
