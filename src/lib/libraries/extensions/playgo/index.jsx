// Ícono placeholder: SVG inline en base64 (mismo patrón que blockIconURI en
// scratch-vm/src/extensions/teachablemachine/index.js) — no hay assets PNG de marca
// todavía. Reemplazar por un PNG real cuando haya arte de marca definitivo, igual que
// playme/index.jsx (import playgoIconURL from './playgo.png').
const playgoIconURL = 'data:image/svg+xml;base64,' +
    'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj' +
    '48cmVjdCB4PSI2IiB5PSIxNCIgd2lkdGg9IjI4IiBoZWlnaHQ9IjE2IiByeD0iNCIgZmlsbD0iI2ZmZiIgc3Ryb2tlPSIjMjdBRTYwIiBzdHJv' +
    'a2Utd2lkdGg9IjIiLz48Y2lyY2xlIGN4PSIyMCIgY3k9IjIyIiByPSI1IiBmaWxsPSIjMjdBRTYwIi8+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMi' +
    'Igcj0iMiIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjYiIGN5PSIzMiIgcj0iNCIgZmlsbD0iIzFFODQ0OSIvPjxjaXJjbGUgY3g9IjM0IiBj' +
    'eT0iMzIiIHI9IjQiIGZpbGw9IiMxRTg0NDkiLz48cmVjdCB4PSIxNyIgeT0iNiIgd2lkdGg9IjYiIGhlaWdodD0iNiIgcng9IjIiIGZpbGw9Ii' +
    'MyN0FFNjAiLz48L3N2Zz4=';

export default {
    name: 'PlayGo',
    extensionId: 'playgo',
    collaborator: 'TDRobotica',
    iconURL: playgoIconURL,
    insetIconURL: playgoIconURL,
    description: 'Conecta y controla tu robot PlayGo',
    featured: true
};
