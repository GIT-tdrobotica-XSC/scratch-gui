import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape, defineMessages} from 'react-intl';
import VM from 'scratch-vm';

import spriteLibraryContent from '../lib/libraries/sprites.json';
import randomizeSpritePosition from '../lib/randomize-sprite-position';
import spriteTags from '../lib/libraries/sprite-tags';

// Sprites locales (no en CDN de Scratch) — inyectar URL para preview en biblioteca
import daneelIcon from '../lib/default-project/14a3e0d41d648b4415b4a78cb65ba725.svg';
// Contenido raw de los SVGs para pre-cargar en scratch-storage al agregar el sprite
/* eslint-disable import/no-unresolved */
import daneel1Svg from '!raw-loader!../lib/default-project/14a3e0d41d648b4415b4a78cb65ba725.svg?';
import daneel2Svg from '!raw-loader!../lib/default-project/54ae922e118ccf76a22e935737e2a579.svg?';
import daneel3Svg from '!raw-loader!../lib/default-project/82d8ed9bb53b3f026a5d9d59086a4d6e.svg?';
/* eslint-enable import/no-unresolved */

const LOCAL_ICONS = {
    Daneel: daneelIcon
};

// MD5 → contenido SVG raw, para inyectar en storage al agregar Daneel
const LOCAL_ASSETS = {
    '14a3e0d41d648b4415b4a78cb65ba725': daneel1Svg,
    '54ae922e118ccf76a22e935737e2a579': daneel2Svg,
    '82d8ed9bb53b3f026a5d9d59086a4d6e': daneel3Svg
};

const enrichedSpriteLibrary = spriteLibraryContent.map(sprite =>
    LOCAL_ICONS[sprite.name] ? { ...sprite, rawURL: LOCAL_ICONS[sprite.name] } : sprite
);

import LibraryComponent from '../components/library/library.jsx';

const messages = defineMessages({
    libraryTitle: {
        defaultMessage: 'Choose a Sprite',
        description: 'Heading for the sprite library',
        id: 'gui.spriteLibrary.chooseASprite'
    }
});

class SpriteLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
    }
    handleItemSelect (item) {
        // Randomize position of library sprite
        randomizeSpritePosition(item);

        // Para sprites locales, inyectar sus assets en scratch-storage antes de
        // addSprite. Sin esto, scratch-storage intenta resolver vía CDN
        // (cdn.assets.scratch.mit.edu) y falla → costume queda en blanco.
        const storage = this.props.vm.runtime && this.props.vm.runtime.storage;
        if (storage && item.costumes) {
            const encoder = (typeof TextEncoder !== 'undefined')
                ? new TextEncoder()
                : new (require('fastestsmallesttextencoderdecoder').TextEncoder)();
            for (const costume of item.costumes) {
                const md5 = costume.assetId;
                if (md5 && LOCAL_ASSETS[md5]) {
                    try {
                        storage.createAsset(
                            storage.AssetType.ImageVector,
                            storage.DataFormat.SVG,
                            encoder.encode(LOCAL_ASSETS[md5]),
                            md5,
                            false
                        );
                    } catch (e) {
                        console.warn('No se pudo inyectar asset local en storage:', md5, e);
                    }
                }
            }
        }

        this.props.vm.addSprite(JSON.stringify(item)).then(() => {
            this.props.onActivateBlocksTab();
        });
    }
    render () {
        return (
            <LibraryComponent
                data={enrichedSpriteLibrary}
                id="spriteLibrary"
                tags={spriteTags}
                title={this.props.intl.formatMessage(messages.libraryTitle)}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

SpriteLibrary.propTypes = {
    intl: intlShape.isRequired,
    onActivateBlocksTab: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default injectIntl(SpriteLibrary);
