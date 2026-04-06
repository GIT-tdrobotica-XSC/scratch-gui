import projectData from './project-data';

/* eslint-disable import/no-unresolved */
import popWav from '!arraybuffer-loader!./83a9787d4cb6f3b7632b4ddfebf74367.wav?';
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg?';
// Disfraces Daneel (robot por defecto) en SVG. PNGs del gato se mantienen como backup en el directorio.
import daneel1 from '!raw-loader!./437d84c1ef5e6b6a1efd41089ca0057a.svg?';
import daneel2 from '!raw-loader!./1291b0483c49f9ac32277df3d99378fc.svg?';
import daneel3 from '!raw-loader!./580538f54f3ca996775a23b295b4f0cd.svg?';
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
        id: '437d84c1ef5e6b6a1efd41089ca0057a',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(daneel1)
    }, {
        id: '1291b0483c49f9ac32277df3d99378fc',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(daneel2)
    }, {
        id: '580538f54f3ca996775a23b295b4f0cd',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(daneel3)
    }];
};

export default defaultProject;
