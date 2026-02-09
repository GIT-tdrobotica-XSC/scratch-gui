import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import styles from './tabs.css';

const TabsComponent = props => {
    const {
        tabs,
        activeTab,
        onTabChange
    } = props;

    return (
        <div className={styles.tabsContainer}>
            <div className={styles.tabsList}>
                {tabs.map((tab, index) => (
                    <button
                        key={index}
                        className={classNames(styles.tab, {
                            [styles.tabActive]: activeTab === index
                        })}
                        onClick={() => onTabChange(index)}
                    >
                        {tab}
                    </button>
                ))}
            </div>
        </div>
    );
};

TabsComponent.propTypes = {
    tabs: PropTypes.arrayOf(PropTypes.string).isRequired,
    activeTab: PropTypes.number.isRequired,
    onTabChange: PropTypes.func.isRequired
};

export default TabsComponent;