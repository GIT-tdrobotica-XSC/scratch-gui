import React from 'react';
import classNames from 'classnames';
import styles from './ml-studio.css';

const TFJS_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js';
const MOBILENET_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.0/dist/mobilenet.min.js';
const KNN_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier@1.2.4/dist/knn-classifier.min.js';
const POSENET_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/posenet@2.2.2/dist/posenet.min.js';

const STORAGE_KEY = 'playcode_ml_models';
const CAPTURE_INTERVAL_MS = 120;
const PREDICT_INTERVAL_MS = 150;
const POSE_MIN_SCORE = 0.2;

// Paleta de colores por clase (estilo Teachable Machine)
const CLASS_COLORS = [
    '#4C97FF', '#FF8C1A', '#59C059', '#FF6680',
    '#9966FF', '#00B4D8', '#FFAB19', '#FF5722'
];

// Tipos de proyecto disponibles en la pantalla de selección
const PROJECT_TYPES = [
    {
        id: 'image',
        icon: '📷',
        title: 'Proyecto de Imagen',
        desc: 'Enseña al modelo a reconocer objetos, gestos o lo que vea la cámara.',
        available: true
    },
    {
        id: 'pose',
        icon: '🧍',
        title: 'Proyecto de Pose',
        desc: 'Reconoce posturas del cuerpo: brazos arriba, sentado, saltando…',
        available: true
    },
    {
        id: 'audio',
        icon: '🎤',
        title: 'Proyecto de Audio',
        desc: 'Reconoce sonidos y palabras con el micrófono.',
        available: false
    }
];

class MLStudio extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            projectType: null, // null = pantalla de selección
            modelName: 'Mi Modelo',
            classes: [
                {name: 'Clase 1', sampleCount: 0, thumbnails: []},
                {name: 'Clase 2', sampleCount: 0, thumbnails: []}
            ],
            isTrained: false,
            isTraining: false,
            capturingClass: null,
            liveConfidences: {}, // { classIndex: probability }
            topClassIndex: null,
            cameraReady: false,
            libLoaded: false,
            libLoading: false,
            savedModels: this._readStorage(),
            saveNotice: null
        };

        this.videoRef = React.createRef();
        this.overlayRef = React.createRef(); // canvas para el esqueleto (modo pose)
        this._mobilenet = null;
        this._posenet = null;
        this._classifier = null;
        this._captureTimer = null;
        this._predictTimer = null;
        this._poseRAF = null;
        this._lastPoseVec = null; // último vector de keypoints (modo pose)
        this._stream = null;
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    _readStorage () {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    _writeStorage (models) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
        window.playcodeMLModels = models;
        if (window.__scratchVMRuntime) {
            window.__scratchVMRuntime.emit('ML_MODELS_UPDATED', models);
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    componentWillUnmount () {
        this._stopCamera();
        clearInterval(this._captureTimer);
        clearInterval(this._predictTimer);
        if (this._poseRAF) cancelAnimationFrame(this._poseRAF);
    }

    // ─── Project type selection ────────────────────────────────────────────────

    _selectType (type) {
        const def = PROJECT_TYPES.find(t => t.id === type);
        if (!def || !def.available) return;
        this.setState({projectType: type});
        this._startCamera();
        this._loadLibraries(type);
    }

    // ─── Camera ───────────────────────────────────────────────────────────────

    async _startCamera () {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {width: 640, height: 480, facingMode: 'user'}
            });
            this._stream = stream;
            if (this.videoRef.current) {
                this.videoRef.current.srcObject = stream;
                this.videoRef.current.onloadeddata = () => {
                    this.setState({cameraReady: true});
                    if (this.state.projectType === 'pose') this._startPoseOverlay();
                };
            }
        } catch (err) {
            console.error('[MLStudio] Cámara no disponible:', err);
        }
    }

    _stopCamera () {
        if (this._stream) {
            this._stream.getTracks().forEach(t => t.stop());
            this._stream = null;
        }
    }

    // ─── CDN Libraries ────────────────────────────────────────────────────────

    _injectScript (src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing && existing.getAttribute('data-loaded') === 'true') return resolve();
            if (existing) {
                existing.addEventListener('load', resolve);
                existing.addEventListener('error', reject);
                return;
            }
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => {
                s.setAttribute('data-loaded', 'true');
                resolve();
            };
            s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
            document.head.appendChild(s);
        });
    }

    async _loadLibraries (type) {
        if (this.state.libLoaded || this.state.libLoading) return;
        this.setState({libLoading: true});
        try {
            await this._injectScript(TFJS_URL);
            await this._injectScript(KNN_URL);
            this._classifier = window.knnClassifier.create();

            if (type === 'pose') {
                await this._injectScript(POSENET_URL);
                this._posenet = await window.posenet.load({
                    architecture: 'MobileNetV1',
                    outputStride: 16,
                    inputResolution: {width: 257, height: 257},
                    multiplier: 0.75
                });
            } else {
                await this._injectScript(MOBILENET_URL);
                this._mobilenet = await window.mobilenet.load();
            }

            this.setState({libLoaded: true, libLoading: false});
            // Si la cámara ya está lista y es pose, arrancar el overlay del esqueleto
            if (type === 'pose' && this.state.cameraReady) this._startPoseOverlay();
        } catch (err) {
            console.error('[MLStudio] Error cargando librerías TF:', err);
            this.setState({libLoading: false});
        }
    }

    // ─── Pose helpers ───────────────────────────────────────────────────────────

    // Convierte una pose de PoseNet en un vector normalizado (invariante a
    // traslación y escala) que sirve como features para el KNN.
    _poseToVector (pose) {
        if (!pose || !pose.keypoints) return null;
        const kp = pose.keypoints;
        const xs = kp.map(k => k.position.x);
        const ys = kp.map(k => k.position.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const w = (maxX - minX) || 1;
        const h = (maxY - minY) || 1;
        const vec = [];
        for (const k of kp) {
            vec.push((k.position.x - minX) / w);
            vec.push((k.position.y - minY) / h);
        }
        return vec; // 34 dims (17 keypoints × 2)
    }

    // Loop continuo que estima la pose, guarda el último vector y dibuja
    // el esqueleto sobre la cámara mientras el modo pose esté activo.
    _startPoseOverlay () {
        if (this._poseRAF) cancelAnimationFrame(this._poseRAF);
        const tick = async () => {
            if (this.state.projectType !== 'pose') return;
            const video = this.videoRef.current;
            if (video && this._posenet && video.readyState >= 2) {
                try {
                    const pose = await this._posenet.estimateSinglePose(video, {flipHorizontal: false});
                    this._lastPoseVec = this._poseToVector(pose);
                    this._drawSkeleton(pose);
                } catch (e) { /* ignore */ }
            }
            this._poseRAF = requestAnimationFrame(tick);
        };
        this._poseRAF = requestAnimationFrame(tick);
    }

    _drawSkeleton (pose) {
        const canvas = this.overlayRef.current;
        const video = this.videoRef.current;
        if (!canvas || !video || !video.videoWidth) return;
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!pose) return;

        // Puntos
        for (const k of pose.keypoints) {
            if (k.score < POSE_MIN_SCORE) continue;
            ctx.beginPath();
            ctx.arc(k.position.x, k.position.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#00e676';
            ctx.fill();
        }
        // Líneas (huesos)
        const adj = window.posenet.getAdjacentKeyPoints(pose.keypoints, POSE_MIN_SCORE);
        ctx.strokeStyle = '#4c97ff';
        ctx.lineWidth = 3;
        for (const pair of adj) {
            ctx.beginPath();
            ctx.moveTo(pair[0].position.x, pair[0].position.y);
            ctx.lineTo(pair[1].position.x, pair[1].position.y);
            ctx.stroke();
        }
    }

    // ─── Features (unificado image/pose) ────────────────────────────────────────

    // Devuelve un tensor de features para la imagen actual. El llamador es
    // responsable de hacer dispose(). Retorna null si no hay datos válidos.
    _extractFeatures () {
        const video = this.videoRef.current;
        if (!video || video.readyState < 2 || !window.tf) return null;

        if (this.state.projectType === 'pose') {
            if (!this._lastPoseVec) return null;
            return window.tf.tensor1d(this._lastPoseVec);
        }
        // image
        if (!this._mobilenet) return null;
        return this._mobilenet.infer(video, true);
    }

    // ─── Capture ──────────────────────────────────────────────────────────────

    _captureFrame (classIndex) {
        const video = this.videoRef.current;
        if (!video || !this._classifier) return;

        const features = this._extractFeatures();
        if (!features) return;
        this._classifier.addExample(features, String(classIndex));
        features.dispose();

        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 75;
        canvas.getContext('2d').drawImage(video, 0, 0, 100, 75);
        const thumb = canvas.toDataURL('image/jpeg', 0.6);

        this.setState(prev => {
            const classes = prev.classes.map((c, i) => {
                if (i !== classIndex) return c;
                return {
                    ...c,
                    sampleCount: c.sampleCount + 1,
                    thumbnails: [...c.thumbnails.slice(-23), thumb]
                };
            });
            return {classes, isTrained: false};
        });
    }

    _startCapture (classIndex) {
        if (!this.state.libLoaded) return;
        this.setState({capturingClass: classIndex});
        this._captureFrame(classIndex);
        this._captureTimer = setInterval(() => this._captureFrame(classIndex), CAPTURE_INTERVAL_MS);
    }

    _stopCapture () {
        clearInterval(this._captureTimer);
        this._captureTimer = null;
        this.setState({capturingClass: null});
    }

    // ─── Training ─────────────────────────────────────────────────────────────

    async _train () {
        const {classes} = this.state;
        if (!this._classifier) return;
        const minSamples = Math.min(...classes.map(c => c.sampleCount));
        if (minSamples < 2) return;

        this.setState({isTraining: true});
        await new Promise(r => setTimeout(r, 500));
        this.setState({isTraining: false, isTrained: true});
        this._startPredictLoop();
    }

    _startPredictLoop () {
        clearInterval(this._predictTimer);
        this._confBuffer = [];
        this._predictTimer = setInterval(async () => {
            if (!this._classifier) return;
            if (this._classifier.getNumClasses() < 2) return;
            try {
                // k del KNN según la clase con menos muestras (entre 3 y 10)
                const minSamples = Math.min(...this.state.classes.map(c => c.sampleCount || 0));
                const k = Math.max(3, Math.min(10, Math.floor(minSamples / 2) || 3));

                const features = this._extractFeatures();
                if (!features) return;
                const result = await this._classifier.predictClass(features, k);
                features.dispose();

                // Suavizado temporal sobre las últimas 8 predicciones
                this._confBuffer.push(result.confidences);
                if (this._confBuffer.length > 8) this._confBuffer.shift();
                const smoothed = {};
                for (const buf of this._confBuffer) {
                    for (const label in buf) {
                        smoothed[label] = (smoothed[label] || 0) + buf[label];
                    }
                }
                const conf = {};
                let topIdx = null;
                let topProb = -1;
                for (const label in smoothed) {
                    const avg = smoothed[label] / this._confBuffer.length;
                    conf[parseInt(label, 10)] = avg;
                    if (avg > topProb) {
                        topProb = avg;
                        topIdx = parseInt(label, 10);
                    }
                }
                this.setState({liveConfidences: conf, topClassIndex: topIdx});
            } catch (e) { /* ignore */ }
        }, PREDICT_INTERVAL_MS);
    }

    // ─── Save / Delete models ─────────────────────────────────────────────────

    _saveModel () {
        const {modelName, classes, projectType} = this.state;
        if (!this._classifier || !this.state.isTrained) return;
        const name = modelName.trim();
        if (!name) return;

        const dataset = this._classifier.getClassifierDataset();
        const serialized = {};
        for (const label in dataset) {
            serialized[label] = {
                data: Array.from(dataset[label].dataSync()),
                shape: dataset[label].shape
            };
        }

        const model = {
            name,
            type: projectType || 'image',
            classes: classes.map((c, i) => ({index: String(i), name: c.name})),
            dataset: serialized,
            createdAt: new Date().toISOString()
        };

        const savedModels = {...this.state.savedModels, [name]: model};
        this._writeStorage(savedModels);
        this.setState({savedModels, saveNotice: `"${name}" guardado correctamente`});
        setTimeout(() => this.setState({saveNotice: null}), 3500);
    }

    _deleteModel (name) {
        const savedModels = {...this.state.savedModels};
        delete savedModels[name];
        this._writeStorage(savedModels);
        this.setState({savedModels});
    }

    _loadModelToEdit (name) {
        const model = this.state.savedModels[name];
        if (!model || !this._classifier) return;

        // Reconstruir el classifier
        this._classifier.clearAllClasses();
        if (window.tf) {
            const dataset = {};
            for (const label in model.dataset) {
                const {data, shape} = model.dataset[label];
                dataset[label] = window.tf.tensor2d(data, shape);
            }
            this._classifier.setClassifierDataset(dataset);
        }

        // Contar muestras por clase
        const counts = {};
        for (const label in model.dataset) {
            counts[parseInt(label, 10)] = model.dataset[label].shape[0];
        }

        this.setState({
            modelName: model.name,
            classes: model.classes.map((c, i) => ({
                name: c.name,
                sampleCount: counts[i] || 0,
                thumbnails: []
            })),
            isTrained: true
        });
        this._startPredictLoop();
    }

    // ─── Class management ─────────────────────────────────────────────────────

    _addClass () {
        this.setState(prev => ({
            classes: [
                ...prev.classes,
                {name: `Clase ${prev.classes.length + 1}`, sampleCount: 0, thumbnails: []}
            ],
            isTrained: false
        }));
    }

    _removeClass (index) {
        if (this.state.classes.length <= 2) return;
        this.setState(prev => ({
            classes: prev.classes.filter((_, i) => i !== index),
            isTrained: false,
            liveConfidences: {},
            topClassIndex: null
        }));
        if (this._classifier) this._classifier.clearAllClasses();
        clearInterval(this._predictTimer);
    }

    _renameClass (index, name) {
        this.setState(prev => ({
            classes: prev.classes.map((c, i) => i === index ? {...c, name} : c)
        }));
    }

    _clearClass (index) {
        this.setState(prev => ({
            classes: prev.classes.map((c, i) => i === index ?
                {...c, sampleCount: 0, thumbnails: []} : c
            ),
            isTrained: false,
            liveConfidences: {},
            topClassIndex: null
        }));
        if (this._classifier) this._classifier.clearAllClasses();
        clearInterval(this._predictTimer);
    }

    // ─── Render: pantalla de selección ──────────────────────────────────────────

    _renderChooser () {
        return (
            <div className={styles.overlay}>
                <div className={styles.modal}>
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
                            <span className={styles.headerIcon}>🤖</span>
                            <span className={styles.headerTitle}>ML Studio</span>
                        </div>
                        <button className={styles.closeBtn} onClick={this.props.onClose}>×</button>
                    </div>
                    <div className={styles.chooser}>
                        <div className={styles.chooserTitle}>¿Qué quieres crear?</div>
                        <div className={styles.chooserSub}>
                            Elige el tipo de proyecto para tu nuevo modelo
                        </div>
                        <div className={styles.chooserCards}>
                            {PROJECT_TYPES.map(t => (
                                <button
                                    key={t.id}
                                    className={classNames(styles.chooserCard, {
                                        [styles.chooserCardDisabled]: !t.available
                                    })}
                                    onClick={() => this._selectType(t.id)}
                                    disabled={!t.available}
                                >
                                    <span className={styles.chooserIcon}>{t.icon}</span>
                                    <span className={styles.chooserCardTitle}>{t.title}</span>
                                    <span className={styles.chooserCardDesc}>{t.desc}</span>
                                    {!t.available && (
                                        <span className={styles.chooserSoon}>Próximamente</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Render helpers ───────────────────────────────────────────────────────

    _renderClassCard (cls, idx) {
        const {capturingClass, libLoaded, projectType} = this.state;
        const color = CLASS_COLORS[idx % CLASS_COLORS.length];
        const isCapturing = capturingClass === idx;
        const isPose = projectType === 'pose';
        const unit = isPose ? 'pose' : 'imagen';

        return (
            <div
                key={idx}
                className={classNames(styles.classCard, {
                    [styles.classCardCapturing]: isCapturing
                })}
                style={{borderLeftColor: color}}
            >
                <div className={styles.classTop}>
                    <span className={styles.classDot} style={{background: color}} />
                    <input
                        className={styles.classNameInput}
                        value={cls.name}
                        onChange={e => this._renameClass(idx, e.target.value)}
                    />
                    <div className={styles.classMenu}>
                        {cls.sampleCount > 0 && (
                            <button
                                className={styles.iconBtn}
                                onClick={() => this._clearClass(idx)}
                                title="Borrar muestras"
                            >🗑</button>
                        )}
                        {this.state.classes.length > 2 && (
                            <button
                                className={styles.iconBtn}
                                onClick={() => this._removeClass(idx)}
                                title="Eliminar clase"
                            >✕</button>
                        )}
                    </div>
                </div>

                <div className={styles.sampleHeader}>
                    <span className={styles.sampleCountBig} style={{color}}>
                        {cls.sampleCount}
                    </span>
                    <span className={styles.sampleLabel}>
                        muestra{cls.sampleCount !== 1 ? 's' : ''} de {unit}
                    </span>
                </div>

                <div className={styles.thumbsGrid}>
                    {cls.thumbnails.length === 0 ? (
                        <div className={styles.thumbsEmpty}>
                            Mantén presionado el botón para capturar {unit === 'pose' ? 'poses' : 'imágenes'}
                        </div>
                    ) : cls.thumbnails.map((t, ti) => (
                        <img key={ti} src={t} className={styles.thumb} alt="" />
                    ))}
                </div>

                <button
                    className={classNames(styles.recordBtn, {
                        [styles.recordBtnActive]: isCapturing
                    })}
                    style={!isCapturing && libLoaded ? {background: color} : {}}
                    onPointerDown={e => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        this._startCapture(idx);
                    }}
                    onPointerUp={() => this._stopCapture()}
                    onPointerCancel={() => this._stopCapture()}
                    disabled={!libLoaded}
                >
                    {isCapturing ? '⏺ Capturando...' : `${isPose ? '🧍' : '📷'} Mantén para capturar`}
                </button>
            </div>
        );
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    render () {
        const {
            projectType, modelName, classes, isTrained, isTraining, capturingClass,
            liveConfidences, topClassIndex, cameraReady, libLoaded, libLoading,
            savedModels, saveNotice
        } = this.state;

        // Pantalla de selección de tipo de proyecto
        if (!projectType) return this._renderChooser();

        const isPose = projectType === 'pose';
        const typeDef = PROJECT_TYPES.find(t => t.id === projectType);
        // Mostrar solo los modelos guardados del mismo tipo
        const savedList = Object.values(savedModels).filter(
            m => (m.type || 'image') === projectType
        );
        const canTrain = libLoaded && classes.every(c => c.sampleCount >= 2) && classes.length >= 2;

        return (
            <div className={styles.overlay}>
                <div className={styles.modal}>

                    {/* ── Header ── */}
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
                            <span className={styles.headerIcon}>🤖</span>
                            <span className={styles.headerTitle}>ML Studio</span>
                            <span className={styles.headerBadge}>
                                {typeDef.icon} {isPose ? 'Pose' : 'Imagen'}
                            </span>
                            <span className={styles.headerSep}>/</span>
                            <input
                                className={styles.modelNameInput}
                                value={modelName}
                                onChange={e => this.setState({modelName: e.target.value})}
                                placeholder="Nombre del modelo"
                            />
                        </div>
                        <button className={styles.closeBtn} onClick={this.props.onClose}>×</button>
                    </div>

                    {/* ── Body: 3 columnas ── */}
                    <div className={styles.body}>

                        {/* COLUMNA 1: Clases */}
                        <div className={styles.colClasses}>
                            <div className={styles.colHeader}>
                                <span className={styles.colHeaderNum}>1</span>
                                Clases
                            </div>
                            <div className={styles.classScroll}>
                                {classes.map((cls, idx) => this._renderClassCard(cls, idx))}
                                <button className={styles.addClassBtn} onClick={() => this._addClass()}>
                                    <span className={styles.addClassPlus}>+</span>
                                    Agregar otra clase
                                </button>
                            </div>
                        </div>

                        {/* COLUMNA 2: Entrenar */}
                        <div className={styles.colTrain}>
                            <div className={styles.colHeader}>
                                <span className={styles.colHeaderNum}>2</span>
                                Entrenamiento
                            </div>
                            <div className={styles.trainBox}>
                                <button
                                    className={classNames(styles.trainBtn, {
                                        [styles.trainBtnDisabled]: !canTrain || isTraining
                                    })}
                                    onClick={() => this._train()}
                                    disabled={!canTrain || isTraining}
                                >
                                    {isTraining ? (
                                        <span className={styles.trainSpinnerRow}>
                                            <span className={styles.spinner} /> Entrenando...
                                        </span>
                                    ) : '▶ Entrenar modelo'}
                                </button>

                                {!canTrain && libLoaded && (
                                    <div className={styles.trainHint}>
                                        Captura al menos <b>2 muestras</b> en cada clase para poder entrenar.
                                    </div>
                                )}
                                {libLoading && (
                                    <div className={styles.trainHint}>
                                        Cargando {isPose ? 'PoseNet' : 'TensorFlow.js'}...
                                    </div>
                                )}
                                {isTrained && (
                                    <div className={styles.trainedBadge}>
                                        ✓ Modelo entrenado y listo
                                    </div>
                                )}

                                {isTrained && (
                                    <button className={styles.saveBtn} onClick={() => this._saveModel()}>
                                        💾 Guardar modelo
                                    </button>
                                )}
                                {saveNotice && (
                                    <div className={styles.saveNotice}>✓ {saveNotice}</div>
                                )}
                            </div>

                            {/* Modelos guardados */}
                            <div className={styles.savedSection}>
                                <div className={styles.savedTitle}>Modelos guardados</div>
                                {savedList.length === 0 ? (
                                    <div className={styles.savedEmpty}>
                                        Aún no has guardado ningún modelo de este tipo
                                    </div>
                                ) : savedList.map(m => (
                                    <div key={m.name} className={styles.savedRow}>
                                        <button
                                            className={styles.savedLoad}
                                            onClick={() => this._loadModelToEdit(m.name)}
                                            title="Cargar para editar"
                                        >
                                            <span className={styles.savedName}>{m.name}</span>
                                            <span className={styles.savedClasses}>
                                                {m.classes.length} clases · {m.classes.map(c => c.name).join(', ')}
                                            </span>
                                        </button>
                                        <button
                                            className={styles.savedDelete}
                                            onClick={() => this._deleteModel(m.name)}
                                            title="Eliminar"
                                        >✕</button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* COLUMNA 3: Vista previa */}
                        <div className={styles.colPreview}>
                            <div className={styles.colHeader}>
                                <span className={styles.colHeaderNum}>3</span>
                                Vista previa
                            </div>
                            <div className={styles.previewBox}>
                                <div className={classNames(styles.cameraWrap, {
                                    [styles.cameraWrapLive]: cameraReady
                                })}>
                                    <video
                                        ref={this.videoRef}
                                        className={styles.cameraFeed}
                                        autoPlay
                                        muted
                                        playsInline
                                    />
                                    {isPose && (
                                        <canvas
                                            ref={this.overlayRef}
                                            className={styles.poseOverlay}
                                        />
                                    )}
                                    {!cameraReady && (
                                        <div className={styles.cameraOverlay}>
                                            <span className={styles.cameraOverlayDot} />
                                            Iniciando cámara...
                                        </div>
                                    )}
                                    {cameraReady && (
                                        <div className={styles.cameraLiveBadge}>
                                            <span className={styles.cameraLiveDot} />
                                            En vivo
                                        </div>
                                    )}
                                    {capturingClass !== null && (
                                        <div className={styles.cameraCapturingRing} />
                                    )}
                                </div>

                                {/* Barras de confianza */}
                                <div className={styles.outputSection}>
                                    <div className={styles.outputTitle}>Salida</div>
                                    {!isTrained ? (
                                        <div className={styles.outputEmpty}>
                                            Entrena el modelo para ver las predicciones en vivo
                                        </div>
                                    ) : classes.map((cls, idx) => {
                                        const color = CLASS_COLORS[idx % CLASS_COLORS.length];
                                        const pct = Math.round((liveConfidences[idx] || 0) * 100);
                                        const isTop = topClassIndex === idx;
                                        return (
                                            <div key={idx} className={styles.confRow}>
                                                <span className={classNames(styles.confName, {
                                                    [styles.confNameTop]: isTop
                                                })}>
                                                    {cls.name}
                                                </span>
                                                <div className={styles.confBarTrack}>
                                                    <div
                                                        className={styles.confBarFill}
                                                        style={{width: `${pct}%`, background: color}}
                                                    />
                                                </div>
                                                <span className={styles.confPct}>{pct}%</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default MLStudio;
