import projectData from './project-data';

/* eslint-disable import/no-unresolved */
import popWav from '!arraybuffer-loader!./83a9787d4cb6f3b7632b4ddfebf74367.wav?';
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg?';
// Disfraces Daneel (robot por defecto) en SVG. PNGs del gato se mantienen como backup en el directorio.
import daneel1 from '!raw-loader!./14a3e0d41d648b4415b4a78cb65ba725.svg?';
import daneel2 from '!raw-loader!./54ae922e118ccf76a22e935737e2a579.svg?';
import daneel3 from '!raw-loader!./82d8ed9bb53b3f026a5d9d59086a4d6e.svg?';
/* eslint-enable import/no-unresolved */

const defaultProject = translator => {
    let _TextEncoder;
    if (typeof TextEncoder === 'undefined') {
        _TextEncoder = require('fastestsmallesttextencoderdecoder').TextEncoder;
    } else {
        _TextEncoder = TextEncoder;
    }
    const encoder = new _TextEncoder();

    const projectJson = projectData(translator);
    return [{
        id: 0,
        assetType: 'Project',
        dataFormat: 'JSON',
        data: JSON.stringify(projectJson)
    }, {
        id: '83a9787d4cb6f3b7632b4ddfebf74367',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(popWav)
    }, {
        id: 'cd21514d0531fdffb22204e0ec5ed84a',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(backdrop)
    }, {
        id: '14a3e0d41d648b4415b4a78cb65ba725',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(daneel1)
    }, {
        id: '54ae922e118ccf76a22e935737e2a579',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(daneel2)
    }, {
        id: '82d8ed9bb53b3f026a5d9d59086a4d6e',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(daneel3)
    }];
};

export default defaultProject;
