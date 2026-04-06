import projectData from './project-data';

/* eslint-disable import/no-unresolved */
import popWav from '!arraybuffer-loader!./83a9787d4cb6f3b7632b4ddfebf74367.wav?';
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg?';
// Disfraces Daneel (robot por defecto). SVGs del gato se mantienen como backup en el directorio.
import daneel1 from '!arraybuffer-loader!./3cd831ff9bae823b28b4f3a547f169a6.png?';
import daneel2 from '!arraybuffer-loader!./3a7e255b201098534399ab4843a30eb0.png?';
import daneel3 from '!arraybuffer-loader!./7c7b235c58fa70089697d13a02579ac0.png?';
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
        id: '3cd831ff9bae823b28b4f3a547f169a6',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(daneel1)
    }, {
        id: '3a7e255b201098534399ab4843a30eb0',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(daneel2)
    }, {
        id: '7c7b235c58fa70089697d13a02579ac0',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(daneel3)
    }];
};

export default defaultProject;
