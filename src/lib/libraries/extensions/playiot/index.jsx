// Ruta: scratch-gui/src/lib/libraries/extensions/playiot/index.jsx
import playiotIconURL from './playiot.png';
import playiotInsetIconURL from './playiot-small.png';

export default {
    name: 'ESP32 PlayIoT',
    extensionId: 'playiot',
    collaborator: 'TDRobotica',
    iconURL: playiotIconURL,
    insetIconURL: playiotInsetIconURL,
    description: 'Conecta y controla tu placa ESP32 por USB (Web Serial).',
    featured: true
};
