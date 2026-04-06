import projectData from './project-data';

/* eslint-disable import/no-unresolved */
import popWav from '!arraybuffer-loader!./83a9787d4cb6f3b7632b4ddfebf74367.wav?';
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg?';
// Disfraces Daneel (robot por defecto). SVGs del gato se mantienen como backup en el directorio.
import daneel1 from '!arraybuffer-loader!./be9d07b3e85e3d539833c8544d16b5dc.png?';
import daneel2 from '!arraybuffer-loader!./d115264f6bbe5a7d2fb546ed3928a3e3.png?';
import daneel3 from '!arraybuffer-loader!./8aaa757c0a4ad65e56b599009b8f11c6.png?';
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
        id: 'be9d07b3e85e3d539833c8544d16b5dc',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(daneel1)
    }, {
        id: 'd115264f6bbe5a7d2fb546ed3928a3e3',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(daneel2)
    }, {
        id: '8aaa757c0a4ad65e56b599009b8f11c6',
        assetType: 'ImageBitmap',
        dataFormat: 'PNG',
        data: new Uint8Array(daneel3)
    }];
};

export default defaultProject;
