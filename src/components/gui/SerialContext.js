import React, { createContext } from 'react';

export const SerialContext = createContext(null);

export const SerialProvider = ({ children, serialPort }) => {
    return (
        <SerialContext.Provider value={serialPort}>
            {children}
        </SerialContext.Provider>
    );
};