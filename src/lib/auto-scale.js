/**
 * Ajuste automatico de zoom para que toda la interfaz (workspace, paneles,
 * modales) quepa en pantalla sin que el usuario tenga que tocar el zoom
 * del navegador a mano.
 *
 * Reemplaza al viejo `css/responsive.css`: aquella version usaba una
 * escalera de quiebres fijos (1366px, 1280px, 1024px, 768px) y nunca
 * llego a importarse desde ningun lado del build, asi que jamas estuvo
 * activa. Ademas tenia un hueco real: ningun quiebre cubria anchos por
 * encima de 1366px, que es justo donde caen la mayoria de laptops FHD
 * con escalado de Windows (p. ej. 1920x1080 al 125% = 1536x864 de
 * viewport real).
 *
 * Esta version calcula el zoom de forma continua a partir del tamano
 * real de la ventana, así que no puede quedar un rango de resoluciones
 * sin cubrir.
 */

// Resolucion de referencia: a este tamano (o mayor) no se aplica zoom.
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

// Nunca reducir mas alla de esto (deja de ser legible/usable por debajo).
const MIN_ZOOM = 0.55;
// Nunca agrandar -- solo compensamos pantallas chicas, no estiramos las grandes.
const MAX_ZOOM = 1;

// CSS `zoom` cambia `window.innerWidth`/`innerHeight` igual que el zoom
// nativo del navegador (mas zoom out = mas px "logicos" caben). Por eso,
// si calculamos el zoom nuevo directo sobre innerWidth/innerHeight,
// CADA vez que nosotros mismos aplicamos un zoom deformamos la medida de
// la que depende el proximo calculo -- un bucle de realimentacion que
// hacia oscilar el zoom entre valores distintos en cada resize y dejaba
// a Blockly redibujando sus barras de scroll a mitad de esa inestabilidad
// (la linea gris/roja pegada que se veia al mover el zoom rapido).
// Guardamos el ultimo zoom que aplicamos nosotros y lo usamos para
// "deshacer" nuestra propia deformacion antes de medir de nuevo.
let currentZoom = 1;

const computeZoom = () => {
    const trueWidth = window.innerWidth * currentZoom;
    const trueHeight = window.innerHeight * currentZoom;
    const zoomForWidth = trueWidth / DESIGN_WIDTH;
    const zoomForHeight = trueHeight / DESIGN_HEIGHT;
    // La dimension mas restrictiva manda, para que nada quede cortado
    // ni en ancho ni en alto.
    const zoom = Math.min(zoomForWidth, zoomForHeight, MAX_ZOOM);
    return Math.max(MIN_ZOOM, zoom);
};

const applyZoom = () => {
    const zoom = computeZoom();
    if (zoom === currentZoom) return;
    currentZoom = zoom;
    document.documentElement.style.zoom = zoom;
};

/**
 * Debe llamarse una vez al arrancar la app (antes o justo al montar el
 * GUI). Aplica el zoom inicial y lo recalcula si la ventana cambia de
 * tamano (p. ej. el usuario mueve la ventana a otro monitor).
 */
const initAutoScale = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    // `zoom` no es estandar CSS; lo soportan Chrome/Edge/Safari y Firefox 126+.
    // Si el navegador no lo entiende, no tocamos nada (mejor que un layout roto).
    if (!('zoom' in document.documentElement.style)) return;

    applyZoom();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyZoom, 150);
    });
};

export default initAutoScale;
