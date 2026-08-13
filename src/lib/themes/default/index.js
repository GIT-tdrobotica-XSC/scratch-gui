/*
    Tema por defecto — línea gráfica "Taller".

    DOS GRUPOS DISTINTOS, con criterios distintos:

    1. COLORES DE CATEGORÍA (motion, looks, control...). Se conservan
       reconocibles — Movimiento sigue siendo azul y Control naranja, que es
       vocabulario que los niños ya tienen aprendido — pero bajados en
       luminosidad. Los tonos originales de Scratch (sobre todo el amarillo
       #FFBF00 y el naranja) no dan contraste suficiente con el texto blanco
       que llevan encima.

    2. COLORES DEL ENTORNO (workspace, toolbox, flyout...). Antes estaban
       teñidos de rosa (#FCEAEA, #FFE5E5, #FFF0F0). Con los bloques encima,
       ese fondo rosa competía por atención y ensuciaba los colores de
       categoría. Pasan a los neutros cálidos del taller (ver css/taller.css),
       para que el color lo pongan las piezas y no el fondo.
*/

const blockColors = {
    motion: {
        primary: '#2F6BD8',
        secondary: '#2A60C2',
        tertiary: '#2454AB',
        quaternary: '#2454AB'
    },
    looks: {
        primary: '#7D4BD6',
        secondary: '#7043C2',
        tertiary: '#633BAD',
        quaternary: '#633BAD'
    },
    sounds: {
        primary: '#C0399F',
        secondary: '#AD338F',
        tertiary: '#992D7F',
        quaternary: '#992D7F'
    },
    control: {
        primary: '#E07B14',
        secondary: '#C96E12',
        tertiary: '#B36110',
        quaternary: '#B36110'
    },
    event: {
        primary: '#E0A80C',
        secondary: '#C9970B',
        tertiary: '#B38609',
        quaternary: '#B38609'
    },
    sensing: {
        primary: '#1E9BB5',
        secondary: '#1B8BA3',
        tertiary: '#187A91',
        quaternary: '#187A91'
    },
    pen: {
        primary: '#0DA57A',
        secondary: '#0C9470',
        tertiary: '#0B8263',
        quaternary: '#0B8263'
    },
    operators: {
        primary: '#3FA34D',
        secondary: '#389245',
        tertiary: '#32813D',
        quaternary: '#32813D'
    },
    data: {
        primary: '#D96A16',
        secondary: '#C35F14',
        tertiary: '#AD5511',
        quaternary: '#AD5511'
    },
    data_lists: {
        primary: '#D9541F',
        secondary: '#C34B1C',
        tertiary: '#AD4318',
        quaternary: '#AD4318'
    },
    more: {
        primary: '#E0526B',
        secondary: '#C94960',
        tertiary: '#B34155',
        quaternary: '#B34155'
    },

    // ---- Entorno: neutros del taller, no rosa ----
    text: '#FFFFFF',
    workspace: '#EAE3DF', // superficie de trabajo (banco)
    toolbox: '#F4EFEC', // riel de categorías (bandeja)
    flyout: '#FFFFFF', // bandeja de piezas
    toolboxText: '#241F22',
    /*
        OJO, no son intercambiables — así los aplica scratch-blocks:
          .scratchCategoryMenuItem:hover        { color: toolboxHover }      <- TEXTO
          .scratchCategoryMenuItem.categorySelected { background: toolboxSelected } <- FONDO
        Un color translúcido en toolboxHover deja el texto ilegible al pasar
        el cursor, porque se aplica a la letra y no al fondo.
    */
    toolboxHover: '#CC0000',
    toolboxSelected: '#F2E7E4',
    scrollbar: 'rgba(36, 31, 34, .28)',
    scrollbarHover: 'rgba(36, 31, 34, .45)',
    textField: '#FFFFFF',
    textFieldText: '#241F22',

    // el marcador de inserción y el brillo de pila sí van en rojo de marca:
    // son señales momentáneas, no fondo, y ahí el rojo trabaja a favor
    insertionMarker: '#CC0000',
    insertionMarkerOpacity: 0.30,
    dragShadowOpacity: 0.5,
    stackGlow: '#CC0000',
    stackGlowSize: 4,
    stackGlowOpacity: 1,
    replacementGlow: '#FF3B3B',
    replacementGlowSize: 2,
    replacementGlowOpacity: 1,

    colourPickerStroke: '#CC0000',
    fieldShadow: 'rgba(36, 31, 34, .18)',
    dropDownShadow: 'rgba(20, 12, 16, .28)',
    numPadBackground: '#2B2427',
    numPadBorder: '#3A3135',
    numPadActiveBackground: '#CC0000',
    numPadText: 'white',
    valueReportBackground: '#FFFFFF',
    valueReportBorder: 'rgba(36, 31, 34, .22)',
    menuHover: 'rgba(204, 0, 0, .12)'
};

export {
    blockColors
};
