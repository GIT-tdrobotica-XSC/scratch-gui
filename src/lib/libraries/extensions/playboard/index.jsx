// Ícono inline (data URI SVG) — placeholder sencillo de una placa Arduino en el
// color naranja de PlayBoard. Reemplazable por un PNG real más adelante (como
// hacen playgo/playme), importándolo y usándolo en iconURL/insetIconURL.
const svg = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>",
    "<rect x='8' y='22' width='84' height='56' rx='8' fill='#F5A623'/>",
    "<rect x='39' y='40' width='22' height='22' rx='3' fill='#1E1E1E'/>",
    "<circle cx='20' cy='34' r='3' fill='#ffffff'/>",
    "<circle cx='20' cy='46' r='3' fill='#ffffff'/>",
    "<circle cx='20' cy='58' r='3' fill='#ffffff'/>",
    "<circle cx='80' cy='34' r='3' fill='#ffffff'/>",
    "<circle cx='80' cy='46' r='3' fill='#ffffff'/>",
    "<circle cx='80' cy='58' r='3' fill='#ffffff'/>",
    "</svg>"
].join('');

const playboardIconURL = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export default {
    name: 'PlayBoard + PlayShield',
    extensionId: 'playboard',
    collaborator: 'TDRobotica',
    iconURL: playboardIconURL,
    insetIconURL: playboardIconURL,
    description: 'Conecta y controla tu PlayBoard (Arduino UNO) con PlayShield V2',
    featured: true
};
