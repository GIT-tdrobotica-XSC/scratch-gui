import {STAGE_DISPLAY_SIZES} from '../lib/layout-constants.js';

const SET_STAGE_SIZE = 'scratch-gui/StageSize/SET_STAGE_SIZE';

/*
    Alto por debajo del cual el escenario arranca pequeño.

    En un portátil, el escenario grande (360px de alto) se come la columna
    izquierda entera y deja el panel de dispositivos bajo el pliegue — el mismo
    apretón que sufre el Scratch original. PlayCode es una herramienta de
    robótica: el robot está en la mesa, no en la pantalla, así que la vista
    previa puede ceder ese espacio al panel y al área de bloques. Es la misma
    decisión de producto que toma mBlock.

    Va en el estado INICIAL y no en resolveStageSize a propósito: así el botón
    de escenario grande sigue mandando en cuanto el usuario lo pulsa. Si se
    forzara en resolveStageSize, el toggle quedaría inservible en portátiles.
*/
const SHORT_SCREEN_HEIGHT = 800;

const initialStageSize = (typeof window !== 'undefined' && window.innerHeight < SHORT_SCREEN_HEIGHT) ?
    STAGE_DISPLAY_SIZES.small :
    STAGE_DISPLAY_SIZES.large;

const initialState = {
    stageSize: initialStageSize
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET_STAGE_SIZE:
        return {
            stageSize: action.stageSize
        };
    default:
        return state;
    }
};

const setStageSize = function (stageSize) {
    return {
        type: SET_STAGE_SIZE,
        stageSize: stageSize
    };
};

export {
    reducer as default,
    initialState as stageSizeInitialState,
    setStageSize
};
