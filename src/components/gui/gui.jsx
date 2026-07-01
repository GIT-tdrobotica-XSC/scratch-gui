import classNames from 'classnames';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import { defineMessages, FormattedMessage, injectIntl, intlShape } from 'react-intl';
import { connect } from 'react-redux';
import MediaQuery from 'react-responsive';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import tabStyles from 'react-tabs/style/react-tabs.css';
import VM from 'scratch-vm';
import Renderer from 'scratch-render';

import Blocks from '../../containers/blocks.jsx';
import Controls from '../../containers/controls.jsx';
import CostumeTab from '../../containers/costume-tab.jsx';
import TargetPane from '../../containers/target-pane.jsx';
import SoundTab from '../../containers/sound-tab.jsx';
import StageWrapper from '../../containers/stage-wrapper.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import MenuBar from '../menu-bar/menu-bar.jsx';
import CostumeLibrary from '../../containers/costume-library.jsx';
import BackdropLibrary from '../../containers/backdrop-library.jsx';
import Watermark from '../../containers/watermark.jsx';

import Backpack from '../../containers/backpack.jsx';
import WebGlModal from '../../containers/webgl-modal.jsx';
import TipsLibrary from '../../containers/tips-library.jsx';
import Cards from '../../containers/cards.jsx';
import Alerts from '../../containers/alerts.jsx';
import DragLayer from '../../containers/drag-layer.jsx';
import DeviceToast from '../device-toast/device-toast.jsx';
import ConnectionModal from '../../containers/connection-modal.jsx';
import TelemetryModal from '../telemetry-modal/telemetry-modal.jsx';

import layout, { STAGE_SIZE_MODES } from '../../lib/layout-constants';
import { resolveStageSize } from '../../lib/screen-utils';
import { themeMap } from '../../lib/themes';

import { SerialProvider } from './SerialContext';

import styles from './gui.css';
import addExtensionIcon from './icon--extensions.svg';
import codeIcon from './icon--code.svg';
import costumesIcon from './icon--costumes.svg';
import soundsIcon from './icon--sounds.svg';
import DebugModal from '../debug-modal/debug-modal.jsx';
import MLStudio from '../ml-studio/ml-studio.jsx';

const messages = defineMessages({
    addExtension: {
        id: 'gui.gui.addExtension',
        description: 'Button to add an extension in the target pane',
        defaultMessage: 'Add Extension'
    }
});

// Cache this value to only retrieve it once the first time.
// Assume that it doesn't change for a session.
let isRendererSupported = null;

// Lógica compartida de drag + resize para los widgets flotantes de TM.
// Retorna handlers y estilos de posición/tamaño; el componente aplica los estilos
// y monta los handles invisibles de arrastre y redimensión.
const useTmWidget = (defaultW, defaultH) => {
    const [pos, setPos] = React.useState(() => ({
        x: Math.max(0, window.innerWidth - defaultW - 24),
        y: Math.max(0, window.innerHeight - defaultH - 24)
    }));
    const [size, setSize] = React.useState({w: defaultW, h: defaultH});

    const onDragStart = React.useCallback(e => {
        if (e.button !== 0) return;
        e.preventDefault();
        const ox = e.clientX - pos.x;
        const oy = e.clientY - pos.y;
        const onMove = m => setPos({x: m.clientX - ox, y: m.clientY - oy});
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [pos]);

    const onResizeStart = React.useCallback(e => {
        e.preventDefault();
        e.stopPropagation();
        const sx = e.clientX, sy = e.clientY;
        const sw = size.w, sh = size.h;
        const onMove = m => setSize({
            w: Math.max(180, sw + m.clientX - sx),
            h: Math.max(120, sh + m.clientY - sy)
        });
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [size]);

    const wrapStyle = {
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,191,165,0.3)',
        border: '3px solid #00bfa5',
        zIndex: 900,
        background: '#000',
        userSelect: 'none'
    };

    return {wrapStyle, onDragStart, onResizeStart};
};

const TmDragHandle = ({onDragStart}) => (
    <div
        onMouseDown={onDragStart}
        style={{
            position: 'absolute', top: 0, left: 0, right: 28, height: 32,
            cursor: 'grab', zIndex: 2
        }}
    />
);

const TmCloseBtn = ({onClose}) => (
    <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        onMouseDown={e => e.stopPropagation()}
        style={{
            position: 'absolute', top: 6, right: 6, width: 20, height: 20,
            borderRadius: '50%', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            color: '#fff', border: '1px solid rgba(255,255,255,0.25)',
            cursor: 'pointer', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 3, lineHeight: 1, padding: 0
        }}
        title="Cerrar"
    >×</button>
);

const TmResizeHandle = ({onResizeStart}) => (
    <div
        onMouseDown={onResizeStart}
        style={{
            position: 'absolute', bottom: 3, right: 3,
            width: 14, height: 14, cursor: 'se-resize', zIndex: 3,
            borderRight: '3px solid rgba(255,255,255,0.45)',
            borderBottom: '3px solid rgba(255,255,255,0.45)',
            borderRadius: '0 0 3px 0'
        }}
    />
);

const tmBadgeStyle = {
    position: 'absolute',
    top: '10px',
    left: '10px',
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    color: '#fff',
    fontSize: '0.68rem',
    fontWeight: 800,
    padding: '4px 10px',
    borderRadius: '10px',
    letterSpacing: '0.07em',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    textTransform: 'uppercase'
};

const tmDotStyle = {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#00e676',
    flexShrink: 0,
    boxShadow: '0 0 6px #00e676'
};

const TmCameraWidget = ({stream, flipped, onClose}) => {
    const ref = React.useRef(null);
    const {wrapStyle, onDragStart, onResizeStart} = useTmWidget(260, 195);

    React.useEffect(() => {
        if (ref.current && stream) {
            ref.current.srcObject = stream;
            ref.current.play().catch(() => {});
        }
    }, [stream]);

    return (
        <div style={wrapStyle}>
            <TmDragHandle onDragStart={onDragStart} />
            <video
                ref={ref}
                style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                    transform: flipped ? 'scaleX(-1)' : 'none'}}
                autoPlay
                muted
                playsInline
            />
            <div style={tmBadgeStyle}>
                <span style={tmDotStyle} />
                IA en vivo
            </div>
            <TmCloseBtn onClose={onClose} />
            <TmResizeHandle onResizeStart={onResizeStart} />
        </div>
    );
};

const TM_AUDIO_BANDS = 7;

// Widget de espectro REAL del micrófono (AnalyserNode), no una animación falsa.
const TmAudioWidget = ({onClose}) => {
    const [bars, setBars] = React.useState(new Array(TM_AUDIO_BANDS).fill(0));
    const {wrapStyle, onDragStart, onResizeStart} = useTmWidget(260, 195);

    React.useEffect(() => {
        let ctx;
        let raf;
        let stream;
        let cancelled = false;
        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {noiseSuppression: true, echoCancellation: true, autoGainControl: true}
                });
                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                const Ctx = window.AudioContext || window.webkitAudioContext;
                ctx = new Ctx();
                if (ctx.state === 'suspended') ctx.resume().catch(() => {});
                const src = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 128;
                analyser.smoothingTimeConstant = 0.7;
                src.connect(analyser);
                const data = new Uint8Array(analyser.frequencyBinCount);
                const per = Math.floor(data.length / TM_AUDIO_BANDS);
                const tick = () => {
                    analyser.getByteFrequencyData(data);
                    const out = [];
                    for (let i = 0; i < TM_AUDIO_BANDS; i++) {
                        let sum = 0;
                        for (let j = 0; j < per; j++) sum += data[(i * per) + j];
                        out.push((sum / per) / 255);
                    }
                    setBars(out);
                    raf = requestAnimationFrame(tick);
                };
                tick();
            } catch (e) { /* sin micrófono */ }
        })();
        return () => {
            cancelled = true;
            if (raf) cancelAnimationFrame(raf);
            if (stream) stream.getTracks().forEach(t => t.stop());
            if (ctx) ctx.close().catch(() => {});
        };
    }, []);

    return (
        <div style={wrapStyle}>
            <TmDragHandle onDragStart={onDragStart} />
            <div style={{
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                gap: '7px', width: '100%', height: '100%', padding: '28px 24px'
            }}>
                {bars.map((h, i) => (
                    <span
                        key={i}
                        style={{
                            width: '14px', borderRadius: '6px',
                            background: 'linear-gradient(180deg, #00e676, #00bfa5)',
                            transition: 'height 0.12s ease-out', minHeight: '8px',
                            height: `${Math.max(4, Math.round(h * 100))}%`
                        }}
                    />
                ))}
            </div>
            <div style={tmBadgeStyle}>
                <span style={tmDotStyle} />
                Escuchando
            </div>
            <TmCloseBtn onClose={onClose} />
            <TmResizeHandle onResizeStart={onResizeStart} />
        </div>
    );
};

const GUIComponent = props => {
    const [mlStudioOpen, setMlStudioOpen] = React.useState(false);
    const [tmCameraStream, setTmCameraStream] = React.useState(null);
    const [tmVideoFlipped, setTmVideoFlipped] = React.useState(true);
    const [tmAudioActive, setTmAudioActive] = React.useState(false);

    // Escuchar eventos del runtime para abrir ML Studio y mostrar cámara/micrófono
    React.useEffect(() => {
        if (!props.vm) return;
        const rt = props.vm.runtime;
        const onOpen = () => setMlStudioOpen(true);
        const onCamOn = stream => setTmCameraStream(stream);
        const onCamOff = () => setTmCameraStream(null);
        const onFlip = flipped => setTmVideoFlipped(flipped);
        const onAudioOn = () => setTmAudioActive(true);
        const onAudioOff = () => setTmAudioActive(false);
        rt.on('OPEN_ML_STUDIO', onOpen);
        rt.on('TM_CAMERA_STARTED', onCamOn);
        rt.on('TM_CAMERA_STOPPED', onCamOff);
        rt.on('TM_VIDEO_FLIP', onFlip);
        rt.on('TM_AUDIO_STARTED', onAudioOn);
        rt.on('TM_AUDIO_STOPPED', onAudioOff);
        return () => {
            rt.off('OPEN_ML_STUDIO', onOpen);
            rt.off('TM_CAMERA_STARTED', onCamOn);
            rt.off('TM_CAMERA_STOPPED', onCamOff);
            rt.off('TM_VIDEO_FLIP', onFlip);
            rt.off('TM_AUDIO_STARTED', onAudioOn);
            rt.off('TM_AUDIO_STOPPED', onAudioOff);
        };
    }, [props.vm]);

    const {
        accountNavOpen,
        activeTabIndex,
        alertsVisible,
        authorId,
        authorThumbnailUrl,
        authorUsername,
        basePath,
        backdropLibraryVisible,
        backpackHost,
        backpackVisible,
        blocksId,
        blocksTabVisible,
        cardsVisible,
        canChangeLanguage,
        canChangeTheme,
        canCreateNew,
        canEditTitle,
        canManageFiles,
        canRemix,
        canSave,
        canCreateCopy,
        canShare,
        canUseCloud,
        children,
        connectionModalVisible,
        costumeLibraryVisible,
        costumesTabVisible,
        debugModalVisible,
        editingTargetIsDevice,
        enableCommunity,
        intl,
        isCreating,
        isFullScreen,
        isPlayerOnly,
        isRtl,
        isShared,
        isTelemetryEnabled,
        isTotallyNormal,
        loading,
        logo,
        renderLogin,
        onClickAbout,
        onClickAccountNav,
        onCloseAccountNav,
        onLogOut,
        onOpenRegistration,
        onToggleLoginOpen,
        onActivateCostumesTab,
        onActivateSoundsTab,
        onActivateTab,
        onClickLogo,
        onExtensionButtonClick,
        onProjectTelemetryEvent,
        onRequestCloseBackdropLibrary,
        onRequestCloseCostumeLibrary,
        onRequestCloseDebugModal,
        onRequestCloseTelemetryModal,
        onSeeCommunity,
        onShare,
        onShowPrivacyPolicy,
        onStartSelectingFileUpload,
        onTelemetryModalCancel,
        onTelemetryModalOptIn,
        onTelemetryModalOptOut,
        showComingSoon,
        soundsTabVisible,
        stageSizeMode,
        targetIsStage,
        telemetryModalVisible,
        theme,
        tipsLibraryVisible,
        vm,
        ...componentProps
    } = omit(props, 'dispatch');
    // Auto-switch to Code tab when switching to a device target,
    // because Costumes/Sounds tabs are hidden for device targets and
    // react-tabs would render a blank panel if left on those indices.
    React.useEffect(() => {
        if (editingTargetIsDevice && activeTabIndex !== 0) {
            onActivateTab(0);
        }
    }, [editingTargetIsDevice]); // eslint-disable-line react-hooks/exhaustive-deps

    if (children) {
        return <Box {...componentProps}>{children}</Box>;
    }

    // 🔴 Accede a la instancia de PlayIotSerial
    const serialPort = window.playIotSerial;

    const tabClassNames = {
        tabs: styles.tabs,
        tab: classNames(tabStyles.reactTabsTab, styles.tab),
        tabList: classNames(tabStyles.reactTabsTabList, styles.tabList),
        tabPanel: classNames(tabStyles.reactTabsTabPanel, styles.tabPanel),
        tabPanelSelected: classNames(tabStyles.reactTabsTabPanelSelected, styles.isSelected),
        tabSelected: classNames(tabStyles.reactTabsTabSelected, styles.isSelected)
    };

    if (isRendererSupported === null) {
        isRendererSupported = Renderer.isSupported();
    }

    return (<MediaQuery minWidth={layout.fullSizeMinWidth}>{isFullSize => {
        const stageSize = resolveStageSize(stageSizeMode, isFullSize);

        return (
            <SerialProvider serialPort={serialPort}>
                {isPlayerOnly ? (
                    <StageWrapper
                        isFullScreen={isFullScreen}
                        isRendererSupported={isRendererSupported}
                        isRtl={isRtl}
                        loading={loading}
                        stageSize={STAGE_SIZE_MODES.large}
                        vm={vm}
                    >
                        {alertsVisible ? (
                            <Alerts className={styles.alertsContainer} />
                        ) : null}
                    </StageWrapper>
                ) : (
                    <Box
                        className={styles.pageWrapper}
                        dir={isRtl ? 'rtl' : 'ltr'}
                        {...componentProps}
                    >
                        {telemetryModalVisible ? (
                            <TelemetryModal
                                isRtl={isRtl}
                                isTelemetryEnabled={isTelemetryEnabled}
                                onCancel={onTelemetryModalCancel}
                                onOptIn={onTelemetryModalOptIn}
                                onOptOut={onTelemetryModalOptOut}
                                onRequestClose={onRequestCloseTelemetryModal}
                                onShowPrivacyPolicy={onShowPrivacyPolicy}
                            />
                        ) : null}
                        {loading ? (
                            <Loader />
                        ) : null}
                        {isCreating ? (
                            <Loader messageId="gui.loader.creating" />
                        ) : null}
                        {isRendererSupported ? null : (
                            <WebGlModal isRtl={isRtl} />
                        )}
                        {tipsLibraryVisible ? (
                            <TipsLibrary />
                        ) : null}
                        {cardsVisible ? (
                            <Cards />
                        ) : null}
                        {alertsVisible ? (
                            <Alerts className={styles.alertsContainer} />
                        ) : null}
                        {connectionModalVisible ? (
                            <ConnectionModal
                                vm={vm}
                            />
                        ) : null}
                        {costumeLibraryVisible ? (
                            <CostumeLibrary
                                vm={vm}
                                onRequestClose={onRequestCloseCostumeLibrary}
                            />
                        ) : null}
                        {<DebugModal
                            isOpen={debugModalVisible}
                            onClose={onRequestCloseDebugModal}
                        />}
                        {backdropLibraryVisible ? (
                            <BackdropLibrary
                                vm={vm}
                                onRequestClose={onRequestCloseBackdropLibrary}
                            />
                        ) : null}
                        <MenuBar
                            accountNavOpen={accountNavOpen}
                            authorId={authorId}
                            authorThumbnailUrl={authorThumbnailUrl}
                            authorUsername={authorUsername}
                            canChangeLanguage={canChangeLanguage}
                            canChangeTheme={canChangeTheme}
                            canCreateCopy={canCreateCopy}
                            canCreateNew={canCreateNew}
                            canEditTitle={canEditTitle}
                            canManageFiles={canManageFiles}
                            canRemix={canRemix}
                            canSave={canSave}
                            canShare={canShare}
                            className={styles.menuBarPosition}
                            enableCommunity={enableCommunity}
                            isShared={isShared}
                            isTotallyNormal={isTotallyNormal}
                            logo={logo}
                            renderLogin={renderLogin}
                            showComingSoon={showComingSoon}
                            onClickAbout={onClickAbout}
                            onClickAccountNav={onClickAccountNav}
                            onClickLogo={onClickLogo}
                            onCloseAccountNav={onCloseAccountNav}
                            onLogOut={onLogOut}
                            onOpenRegistration={onOpenRegistration}
                            onProjectTelemetryEvent={onProjectTelemetryEvent}
                            onSeeCommunity={onSeeCommunity}
                            onShare={onShare}
                            onStartSelectingFileUpload={onStartSelectingFileUpload}
                            onToggleLoginOpen={onToggleLoginOpen}
                        />
                        <Box className={styles.bodyWrapper}>
                            <Box className={styles.flexWrapper}>
                                <Box
                                    className={classNames(styles.stageAndTargetWrapper, styles[stageSize])}
                                    data-tutorial="left-panel"
                                >
                                    <StageWrapper
                                        isFullScreen={isFullScreen}
                                        isRendererSupported={isRendererSupported}
                                        isRtl={isRtl}
                                        stageSize={stageSize}
                                        vm={vm}
                                    />
                                    <Box className={styles.targetWrapper}>
                                        <TargetPane
                                            stageSize={stageSize}
                                            vm={vm}
                                        />
                                    </Box>
                                </Box>
                                <Box
                                    className={styles.editorWrapper}
                                    data-tutorial="editor"
                                >
                                    <Tabs
                                        forceRenderTabPanel
                                        className={tabClassNames.tabs}
                                        selectedIndex={activeTabIndex}
                                        selectedTabClassName={tabClassNames.tabSelected}
                                        selectedTabPanelClassName={tabClassNames.tabPanelSelected}
                                        onSelect={onActivateTab}
                                    >
                                        <TabList className={tabClassNames.tabList}>
                                            <Tab className={tabClassNames.tab}>
                                                <img
                                                    draggable={false}
                                                    src={codeIcon}
                                                />
                                                <FormattedMessage
                                                    defaultMessage="Code"
                                                    description="Button to get to the code panel"
                                                    id="gui.gui.codeTab"
                                                />
                                            </Tab>
                                            {!editingTargetIsDevice && <Tab
                                                className={tabClassNames.tab}
                                                onClick={onActivateCostumesTab}
                                            >
                                                <img
                                                    draggable={false}
                                                    src={costumesIcon}
                                                />
                                                {targetIsStage ? (
                                                    <FormattedMessage
                                                        defaultMessage="Backdrops"
                                                        description="Button to get to the backdrops panel"
                                                        id="gui.gui.backdropsTab"
                                                    />
                                                ) : (
                                                    <FormattedMessage
                                                        defaultMessage="Costumes"
                                                        description="Button to get to the costumes panel"
                                                        id="gui.gui.costumesTab"
                                                    />
                                                )}
                                            </Tab>}
                                            {!editingTargetIsDevice && <Tab
                                                className={tabClassNames.tab}
                                                onClick={onActivateSoundsTab}
                                            >
                                                <img
                                                    draggable={false}
                                                    src={soundsIcon}
                                                />
                                                <FormattedMessage
                                                    defaultMessage="Sounds"
                                                    description="Button to get to the sounds panel"
                                                    id="gui.gui.soundsTab"
                                                />
                                            </Tab>}
                                        </TabList>
                                        <TabPanel className={tabClassNames.tabPanel}>
                                            <Box
                                                className={styles.blocksWrapper}
                                                data-tutorial="blocks-panel"
                                            >
                                                <Blocks
                                                    key={`${blocksId}/${theme}`}
                                                    canUseCloud={canUseCloud}
                                                    grow={1}
                                                    isVisible={blocksTabVisible}
                                                    options={{
                                                        media: `${basePath}static/${themeMap[theme].blocksMediaFolder}/`
                                                    }}
                                                    stageSize={stageSize}
                                                    theme={theme}
                                                    vm={vm}
                                                />
                                                <div className={styles.workspaceControls}>
                                                    <Controls vm={vm} />
                                                </div>
                                            </Box>
                                            <Box className={styles.extensionButtonContainer}>
                                                <button
                                                    className={styles.extensionButton}
                                                    title={intl.formatMessage(messages.addExtension)}
                                                    onClick={onExtensionButtonClick}
                                                >
                                                    <img
                                                        className={styles.extensionButtonIcon}
                                                        draggable={false}
                                                        src={addExtensionIcon}
                                                    />
                                                </button>
                                            </Box>
                                            <Box className={styles.watermark}>
                                                <Watermark />
                                            </Box>
                                        </TabPanel>
                                        <TabPanel className={tabClassNames.tabPanel}>
                                            {costumesTabVisible ? <CostumeTab vm={vm} /> : null}
                                        </TabPanel>
                                        <TabPanel className={tabClassNames.tabPanel}>
                                            {soundsTabVisible ? <SoundTab vm={vm} /> : null}
                                        </TabPanel>
                                    </Tabs>
                                    {/* {backpackVisible ? (
                                        <Backpack host={backpackHost} />
                                    ) : null} */}
                                </Box>
                            </Box>
                        </Box>
                        {tmCameraStream && (
                            <TmCameraWidget
                                stream={tmCameraStream}
                                flipped={tmVideoFlipped}
                                onClose={() => {
                                    // Avisar al VM para que libere cámara e inferencia;
                                    // el VM emitirá TM_CAMERA_STOPPED y el estado local
                                    // se limpia vía el listener de eventos ya existente.
                                    if (props.vm) props.vm.runtime.emit('TM_CLOSE_CAMERA');
                                    else setTmCameraStream(null);
                                }}
                            />
                        )}
                        {tmAudioActive && !tmCameraStream && (
                            <TmAudioWidget
                                onClose={() => {
                                    if (props.vm) props.vm.runtime.emit('TM_CLOSE_AUDIO');
                                    else setTmAudioActive(false);
                                }}
                            />
                        )}
                        {mlStudioOpen && (
                            <MLStudio onClose={() => setMlStudioOpen(false)} />
                        )}
                        <DragLayer />
                        <DeviceToast vm={vm} />
                    </Box>
                )}
            </SerialProvider>
        );
    }}</MediaQuery>);
};

GUIComponent.propTypes = {
    accountNavOpen: PropTypes.bool,
    activeTabIndex: PropTypes.number,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    backdropLibraryVisible: PropTypes.bool,
    backpackHost: PropTypes.string,
    backpackVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksTabVisible: PropTypes.bool,
    blocksId: PropTypes.string,
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    cardsVisible: PropTypes.bool,
    children: PropTypes.node,
    costumeLibraryVisible: PropTypes.bool,
    costumesTabVisible: PropTypes.bool,
    editingTargetIsDevice: PropTypes.bool,
    debugModalVisible: PropTypes.bool,
    enableCommunity: PropTypes.bool,
    intl: intlShape.isRequired,
    isCreating: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    loading: PropTypes.bool,
    logo: PropTypes.string,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func,
    onActivateTab: PropTypes.func,
    onClickAccountNav: PropTypes.func,
    onClickLogo: PropTypes.func,
    onCloseAccountNav: PropTypes.func,
    onExtensionButtonClick: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onRequestCloseBackdropLibrary: PropTypes.func,
    onRequestCloseCostumeLibrary: PropTypes.func,
    onRequestCloseDebugModal: PropTypes.func,
    onRequestCloseTelemetryModal: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    onShowPrivacyPolicy: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onTabSelect: PropTypes.func,
    onTelemetryModalCancel: PropTypes.func,
    onTelemetryModalOptIn: PropTypes.func,
    onTelemetryModalOptOut: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    renderLogin: PropTypes.func,
    showComingSoon: PropTypes.bool,
    soundsTabVisible: PropTypes.bool,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    targetIsStage: PropTypes.bool,
    telemetryModalVisible: PropTypes.bool,
    theme: PropTypes.string,
    tipsLibraryVisible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};
GUIComponent.defaultProps = {
    backpackHost: null,
    backpackVisible: false,
    basePath: './',
    blocksId: 'original',
    canChangeLanguage: true,
    canChangeTheme: true,
    canCreateNew: false,
    canEditTitle: false,
    canManageFiles: true,
    canRemix: false,
    canSave: false,
    canCreateCopy: false,
    canShare: false,
    canUseCloud: false,
    enableCommunity: false,
    isCreating: false,
    isShared: false,
    isTotallyNormal: false,
    loading: false,
    showComingSoon: false,
    stageSizeMode: STAGE_SIZE_MODES.large
};

const mapStateToProps = state => ({
    // This is the button's mode, as opposed to the actual current state
    blocksId: state.scratchGui.timeTravel.year.toString(),
    stageSizeMode: state.scratchGui.stageSize.stageSize,
    theme: state.scratchGui.theme.theme
});

export default injectIntl(connect(
    mapStateToProps
)(GUIComponent));