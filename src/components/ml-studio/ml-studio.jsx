import React from 'react';
import classNames from 'classnames';
import styles from './ml-studio.css';

// UNA sola versión de tfjs para los tres tipos (1.5.2, el stack de Google Teachable
// Machine). Dos versiones de tfjs no pueden coexistir: colisionan en el engine global
// ("t is not a function"). speech-commands exige tfjs ^1.5.2; mobilenet/knn/posenet 1.x
// también funcionan con 1.5.2. (Pose usa PoseNet, no MoveNet, porque pose-detection
// requiere tfjs 3.x.)
const TFJS_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.5.2/dist/tf.min.js';
const MOBILENET_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.0/dist/mobilenet.min.js';
const KNN_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier@1.2.4/dist/knn-classifier.min.js';
const POSENET_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/posenet@2.2.2/dist/posenet.min.js';
const SPEECH_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.4.2/dist/speech-commands.min.js';

const CAPTURE_INTERVAL_MS = 120;
const PREDICT_INTERVAL_MS = 150;
const POSE_MIN_SCORE = 0.2;
const NOISE_LABEL = '_background_noise_';
const AUDIO_MIN_SAMPLES = 8;   // muestras mínimas por sonido
const AUDIO_MIN_NOISE = 20;    // muestras mínimas de ruido de fondo
const AUDIO_EPOCHS = 40;
const AUDIO_FINETUNE_EPOCHS = 8;   // fine-tuning de capas profundas (mejora precisión)
const AUDIO_NOISE_MIX = 0.5;       // mezcla ruido de fondo en las muestras (robustez)
const SMOOTH_WINDOW = 10; // frames de suavizado temporal (imagen/pose)
const AUDIO_THRESHOLD = 0.5; // umbral de confianza para la escucha de audio

// Paleta de colores por clase (estilo Teachable Machine)
const CLASS_COLORS = [
    '#4C97FF', '#FF8C1A', '#59C059', '#FF6680',
    '#9966FF', '#00B4D8', '#FFAB19', '#FF5722'
];

// Tipos de proyecto disponibles en la pantalla de selección
const PROJECT_TYPES = [
    {
        id: 'image',
        short: 'I',
        color: '#4C97FF',
        title: 'Proyecto de Imagen',
        desc: 'Enseña al modelo a reconocer objetos, gestos o lo que vea la cámara.',
        available: true
    },
    {
        id: 'pose',
        short: 'P',
        color: '#9966FF',
        title: 'Proyecto de Pose',
        desc: 'Reconoce posturas del cuerpo: brazos arriba, sentado, saltando…',
        available: true
    },
    {
        id: 'audio',
        short: 'A',
        color: '#FF6680',
        title: 'Proyecto de Audio',
        desc: 'Reconoce sonidos y palabras con el micrófono.',
        available: true
    }
];

// speech-commands (BROWSER_FFT) fue entrenado con audio a 44100 Hz. Muchos sistemas
// usan 48000 Hz → el espectrograma sale desalineado y el modelo pierde precisión
// ("Mismatch in sampling rate"). Forzamos el AudioContext a 44100 (el navegador
// resamplea), así el audio coincide con lo que el modelo espera.
function forceAudioSampleRate () {
    const Orig = window.AudioContext || window.webkitAudioContext;
    if (!Orig || Orig.__pcPatched) return;
    class PatchedAudioContext extends Orig {
        constructor (opts) {
            super(Object.assign({sampleRate: 44100}, opts || {}));
        }
    }
    PatchedAudioContext.__pcPatched = true;
    window.AudioContext = PatchedAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = PatchedAudioContext;
}

// ── Helpers base64 ↔ ArrayBuffer (para serializar ejemplos de audio) ──────────
function abToBase64 (buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}
function base64ToAb (b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

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
            trainProgress: 0, // % de épocas (modo audio)
            capturingClass: null,
            liveConfidences: {}, // { classIndex: probability }
            topClassIndex: null,
            cameraReady: false,
            micReady: false,
            libLoaded: false,
            libLoading: false,
            savedModels: this._readStorage(),
            saveNotice: null
        };

        this.videoRef = React.createRef();
        this.overlayRef = React.createRef();   // canvas esqueleto (pose)
        this.audioVizRef = React.createRef();  // canvas visualizador (audio)

        // image / pose
        this._mobilenet = null;
        this._posenet = null;  // PoseNet (tfjs 1.x)
        this._classifier = null;
        this._captureTimer = null;
        this._predictTimer = null;
        this._poseRAF = null;
        this._lastPoseVec = null;
        this._stream = null;

        // audio (speech-commands maneja TODO el micrófono; sin AnalyserNode propio)
        this._baseRecognizer = null;
        this._transferRecognizer = null;
        this._listening = false;
        this._audioCapturing = false;

        this._mounted = true;
    }

    // setState seguro: no-op si el componente ya se desmontó (evita memory leak por
    // callbacks async de train/listen que terminan después de cerrar el panel)
    _safeSetState (update) {
        if (this._mounted) this.setState(update);
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    // Por ahora los modelos viven SOLO en memoria de la sesión (window). Se reinician
    // al recargar el navegador. El guardado permanente queda pendiente.
    _readStorage () {
        return window.playcodeMLModels || {};
    }

    _writeStorage (models) {
        window.playcodeMLModels = models;
        if (window.__scratchVMRuntime) {
            window.__scratchVMRuntime.emit('ML_MODELS_UPDATED', models);
        }
        return true;
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    componentWillUnmount () {
        this._mounted = false;
        this._audioCapturing = false;
        this._stopCamera();
        clearInterval(this._captureTimer);
        clearInterval(this._predictTimer);
        if (this._poseRAF) cancelAnimationFrame(this._poseRAF);
        if (this._transferRecognizer && this._listening) {
            try { this._transferRecognizer.stopListening(); } catch (e) {
                console.warn('[MLStudio] stopListening (unmount):', e);
            }
        }
    }

    // ─── Project type selection ────────────────────────────────────────────────

    _selectType (type) {
        const def = PROJECT_TYPES.find(t => t.id === type);
        if (!def || !def.available) return;

        if (type === 'audio') {
            // En audio la primera clase es el ruido de fondo (obligatoria)
            this.setState({
                projectType: type,
                classes: [
                    {name: 'Ruido de fondo', isNoise: true, sampleCount: 0, thumbnails: []},
                    {name: 'Clase 1', sampleCount: 0, thumbnails: []}
                ]
            });
            this._loadLibraries(type);
            return;
        }

        this.setState({projectType: type});
        this._startCamera();
        this._loadLibraries(type);
    }

    // ─── Camera (image / pose) ──────────────────────────────────────────────────

    async _startCamera () {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {width: 640, height: 480, facingMode: 'user'}
            });
            this._stream = stream;
            if (this.videoRef.current) {
                this.videoRef.current.srcObject = stream;
                this.videoRef.current.onloadeddata = () => {
                    if (!this._mounted) return;
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

    // ─── Audio visualizer ────────────────────────────────────────────────────────
    // Como el demo oficial de speech-commands: el espectro viene SOLO del recognizer
    // (onSnippet al grabar, result.spectrogram al escuchar). Sin AnalyserNode propio.

    _drawSpectrogram (spec) {
        const canvas = this.audioVizRef.current;
        if (!canvas || !spec || !spec.data || !spec.frameSize) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const frameSize = spec.frameSize;
        const numFrames = Math.floor(spec.data.length / frameSize);
        const last = numFrames - 1;
        if (last < 0) return;
        ctx.clearRect(0, 0, w, h);
        const barW = w / frameSize;
        for (let i = 0; i < frameSize; i++) {
            let v = spec.data[(last * frameSize) + i];
            v = Math.max(0, Math.min(1, (v + 100) / 100)); // log-mel dB → 0..1 aprox
            const barH = v * h;
            const hue = 170 + (v * 60);
            ctx.fillStyle = `hsl(${hue}, 80%, ${40 + (v * 20)}%)`;
            ctx.fillRect(i * barW, h - barH, barW * 0.85, barH);
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
        console.log(`[MLStudio] Cargando librerías para tipo "${type}"...`);
        this.setState({libLoading: true});
        try {
            await this._injectScript(TFJS_URL); // tfjs 1.5.2 para TODO
            console.log(`[MLStudio] tfjs ${window.tf && window.tf.version_core ? window.tf.version_core : '?'} listo`);

            if (type === 'audio') {
                forceAudioSampleRate(); // 44100 Hz (evita el mismatch que daña la precisión)
                await this._injectScript(SPEECH_URL);
                this._baseRecognizer = window.speechCommands.create('BROWSER_FFT');
                await this._baseRecognizer.ensureModelLoaded();
                this._transferRecognizer = this._baseRecognizer.createTransfer(
                    this.state.modelName || 'modelo'
                );
                console.log('[MLStudio] Audio listo (speech-commands BROWSER_FFT cargado)');
                this._safeSetState({libLoaded: true, libLoading: false, micReady: true});
                return;
            }

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
                console.log('[MLStudio] Pose listo (PoseNet cargado)');
            } else {
                await this._injectScript(MOBILENET_URL);
                this._mobilenet = await window.mobilenet.load();
                console.log('[MLStudio] Imagen lista (MobileNet cargado)');
            }

            this._safeSetState({libLoaded: true, libLoading: false});
            if (type === 'pose' && this.state.cameraReady) this._startPoseOverlay();
        } catch (err) {
            console.error('[MLStudio] Error cargando librerías TF:', err);
            this._safeSetState({libLoading: false});
        }
    }

    // ─── Pose helpers ───────────────────────────────────────────────────────────

    // PoseNet: keypoints con {position:{x,y}, score, part}
    _poseToVector (pose) {
        if (!pose || !pose.keypoints) return null;
        const kp = pose.keypoints;
        const valid = kp.filter(k => (k.score || 0) >= POSE_MIN_SCORE);
        if (valid.length < 5) return null;
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

    _startPoseOverlay () {
        if (this._poseRAF) cancelAnimationFrame(this._poseRAF);
        console.log('[MLStudio] Iniciando overlay de pose (PoseNet)');
        let loggedErr = false;
        let loggedOk = false;
        const tick = async () => {
            if (!this._mounted || this.state.projectType !== 'pose') return;
            const video = this.videoRef.current;
            if (video && this._posenet && video.readyState >= 2) {
                try {
                    const pose = await this._posenet.estimateSinglePose(video, {flipHorizontal: false});
                    if (!loggedOk && pose && pose.keypoints) {
                        const n = pose.keypoints.filter(k => k.score >= POSE_MIN_SCORE).length;
                        console.log(`[MLStudio] PoseNet OK: ${n}/${pose.keypoints.length} keypoints con confianza, score pose ${pose.score && pose.score.toFixed(2)}`);
                        loggedOk = true;
                    }
                    this._lastPoseVec = this._poseToVector(pose);
                    this._drawSkeleton(pose);
                } catch (e) {
                    if (!loggedErr) { console.error('[MLStudio] Error PoseNet:', e); loggedErr = true; }
                }
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
        if (!pose || !pose.keypoints) return;

        const kp = pose.keypoints;
        // Huesos
        const adj = window.posenet.getAdjacentKeyPoints(kp, POSE_MIN_SCORE);
        ctx.strokeStyle = '#4c97ff';
        ctx.lineWidth = 4;
        for (const pair of adj) {
            ctx.beginPath();
            ctx.moveTo(pair[0].position.x, pair[0].position.y);
            ctx.lineTo(pair[1].position.x, pair[1].position.y);
            ctx.stroke();
        }
        // Puntos
        for (const k of kp) {
            if (k.score < POSE_MIN_SCORE) continue;
            ctx.beginPath();
            ctx.arc(k.position.x, k.position.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#00e676';
            ctx.fill();
        }
    }

    // ─── Features (image/pose) ──────────────────────────────────────────────────

    _extractFeatures () {
        const video = this.videoRef.current;
        if (!video || video.readyState < 2 || !window.tf) return null;

        if (this.state.projectType === 'pose') {
            if (!this._lastPoseVec) return null;
            return window.tf.tensor1d(this._lastPoseVec);
        }
        if (!this._mobilenet) return null;
        return this._mobilenet.infer(video, true);
    }

    // ─── Capture: image/pose (mantener presionado) ──────────────────────────────

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

    // ─── Capture: audio (graba 1 muestra de ~1s) ────────────────────────────────

    _classLabel (cls) {
        return cls.isNoise ? NOISE_LABEL : cls.name;
    }

    // Mantener presionado graba varias muestras de ~1s seguidas (más datos = mejor modelo).
    // Libera el preview del micrófono para que speech-commands lo use en exclusiva, y
    // visualiza el espectro REAL de lo que graba vía onSnippet.
    async _audioStartCapture (classIndex) {
        if (!this._transferRecognizer || this._audioCapturing) return;
        this._audioCapturing = true;
        this._audioStopListen(); // si estaba escuchando, liberar el micrófono
        this.setState({capturingClass: classIndex});
        const cls = this.state.classes[classIndex];
        const label = this._classLabel(cls);
        // Como el demo de speech-commands: sonidos → durationMultiplier (~2s);
        // ruido de fondo → durationSec 1 (muestras de 1s). Visualiza con onSnippet.
        console.log(`[MLStudio] Grabando audio para "${cls.name}" (label="${label}")`);
        const onSnippet = async spec => { this._drawSpectrogram(spec); };
        const opts = cls.isNoise ?
            {durationSec: 1, snippetDurationSec: 0.1, onSnippet} :
            {durationMultiplier: 2, snippetDurationSec: 0.1, onSnippet};
        try {
            while (this._audioCapturing) {
                await this._transferRecognizer.collectExample(label, opts);
                if (!this._audioCapturing) break; // soltó mientras grababa
                // Conteo real de speech-commands (countExamples), no aproximado
                const counts = this._transferRecognizer.countExamples() || {};
                this._safeSetState(prev => ({
                    classes: prev.classes.map(c => {
                        const lbl = this._classLabel(c);
                        return counts[lbl] != null ? {...c, sampleCount: counts[lbl]} : c;
                    }),
                    isTrained: false
                }));
            }
            console.log('[MLStudio] Muestras de audio:', this._transferRecognizer.countExamples());
        } catch (e) {
            console.error('[MLStudio] Error grabando audio:', e);
        } finally {
            this._audioCapturing = false;
            this._safeSetState({capturingClass: null});
        }
    }

    _audioStopCapture () {
        this._audioCapturing = false;
    }

    // ─── Training ─────────────────────────────────────────────────────────────

    async _train () {
        if (this.state.projectType === 'audio') return this._trainAudio();

        const {classes} = this.state;
        if (!this._classifier) return;
        const minSamples = Math.min(...classes.map(c => c.sampleCount));
        if (minSamples < 2) return;

        this.setState({isTraining: true});
        await new Promise(r => setTimeout(r, 500));
        if (!this._mounted) return;
        this.setState({isTraining: false, isTrained: true});
        this._startPredictLoop();
    }

    async _trainAudio () {
        if (!this._transferRecognizer) return;
        this._audioStopListen(); // liberar el micrófono durante el entrenamiento
        console.log('[MLStudio] Entrenando audio. Muestras:', this._transferRecognizer.countExamples());
        this.setState({isTraining: true, trainProgress: 0});
        // Dar tiempo a React de pintar el loading antes de que train() bloquee el hilo
        await new Promise(r => setTimeout(r, 60));
        try {
            // Como Google TM: aumento de datos mezclando ruido de fondo + fine-tuning
            await this._transferRecognizer.train({
                epochs: AUDIO_EPOCHS,
                fineTuningEpochs: AUDIO_FINETUNE_EPOCHS,
                augmentByMixingNoiseRatio: AUDIO_NOISE_MIX,
                callback: {
                    onEpochEnd: epoch => {
                        this._safeSetState({trainProgress: Math.round(((epoch + 1) / AUDIO_EPOCHS) * 85)});
                    }
                },
                fineTuningCallback: {
                    onEpochEnd: epoch => {
                        this._safeSetState({trainProgress: 85 + Math.round(((epoch + 1) / AUDIO_FINETUNE_EPOCHS) * 15)});
                    }
                }
            });
            console.log('[MLStudio] Entrenamiento de audio terminado');
            this._safeSetState({isTraining: false, isTrained: true, trainProgress: 100});
            if (this._mounted) this._audioStartListen();
        } catch (e) {
            console.error('[MLStudio] Error entrenando audio:', e);
            this._safeSetState({isTraining: false});
        }
    }

    // ─── Inference: image/pose loop ─────────────────────────────────────────────

    _startPredictLoop () {
        clearInterval(this._predictTimer);
        this._confBuffer = [];
        this._predictLoggedErr = false;
        this._predictTimer = setInterval(async () => {
            if (!this._classifier) return;
            if (this._classifier.getNumClasses() < 2) return;
            try {
                const minSamples = Math.min(...this.state.classes.map(c => c.sampleCount || 0));
                const k = Math.max(3, Math.min(10, Math.floor(minSamples / 2) || 3));

                const features = this._extractFeatures();
                if (!features) return;
                const result = await this._classifier.predictClass(features, k);
                features.dispose();

                this._confBuffer.push(result.confidences);
                if (this._confBuffer.length > SMOOTH_WINDOW) this._confBuffer.shift();
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
                this._safeSetState({liveConfidences: conf, topClassIndex: topIdx});
            } catch (e) {
                if (!this._predictLoggedErr) {
                    console.error('[MLStudio] Error en predicción (imagen/pose):', e);
                    this._predictLoggedErr = true;
                }
            }
        }, PREDICT_INTERVAL_MS);
    }

    // ─── Inference: audio listen ────────────────────────────────────────────────

    _audioStartListen () {
        if (!this._transferRecognizer) return;
        if (this._listening) return;
        const labels = this._transferRecognizer.wordLabels();
        console.log('[MLStudio] Escuchando audio. wordLabels:', labels);
        this._transferRecognizer.listen(
            result => {
                if (result.spectrogram) this._drawSpectrogram(result.spectrogram);
                const scores = result.scores;
                const conf = {};
                let topIdx = null;
                let topProb = -1;
                labels.forEach((label, i) => {
                    const idx = this.state.classes.findIndex(
                        c => this._classLabel(c) === label
                    );
                    if (idx < 0) return;
                    conf[idx] = scores[i];
                    if (scores[i] > topProb) {
                        topProb = scores[i];
                        topIdx = idx;
                    }
                });
                this._safeSetState({liveConfidences: conf, topClassIndex: topIdx});
            },
            {
                probabilityThreshold: AUDIO_THRESHOLD,
                overlapFactor: 0.5,
                includeSpectrogram: true,
                invokeCallbackOnNoiseAndUnknown: true
            }
        );
        this._listening = true;
    }

    _audioStopListen () {
        if (this._transferRecognizer && this._listening) {
            try { this._transferRecognizer.stopListening(); } catch (e) {
                console.warn('[MLStudio] stopListening:', e);
            }
        }
        this._listening = false;
    }

    // ─── Save / Delete models ─────────────────────────────────────────────────

    _saveModel () {
        if (this.state.projectType === 'audio') return this._saveAudioModel();

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
        if (!this._writeStorage(savedModels)) return;
        this.setState({savedModels, saveNotice: `"${name}" guardado correctamente`});
        setTimeout(() => this.setState({saveNotice: null}), 3500);
    }

    _saveAudioModel () {
        const {modelName, classes} = this.state;
        if (!this._transferRecognizer || !this.state.isTrained) return;
        const name = modelName.trim();
        if (!name) return;

        // Compartir el recognizer YA ENTRENADO en memoria → el bloque lo usa directo,
        // sin re-entrenar (carga instantánea). Se pierde al recargar el navegador.
        window.playcodeAudioModels = window.playcodeAudioModels || {};
        window.playcodeAudioModels[name] = this._transferRecognizer;

        let audioData = null;
        try {
            const serialized = this._transferRecognizer.serializeExamples();
            audioData = abToBase64(serialized);
        } catch (e) {
            console.error('[MLStudio] Error serializando audio:', e);
        }

        const model = {
            name,
            type: 'audio',
            classes: classes.map((c, i) => ({
                index: String(i),
                name: c.name,
                label: this._classLabel(c),
                isNoise: !!c.isNoise
            })),
            audioData,
            createdAt: new Date().toISOString()
        };

        const savedModels = {...this.state.savedModels, [name]: model};
        if (!this._writeStorage(savedModels)) return;
        this.setState({savedModels, saveNotice: `"${name}" guardado correctamente`});
        setTimeout(() => this.setState({saveNotice: null}), 3500);
    }

    _deleteModel (name) {
        const savedModels = {...this.state.savedModels};
        delete savedModels[name];
        this._writeStorage(savedModels);
        this.setState({savedModels});
    }

    async _loadModelToEdit (name) {
        const model = this.state.savedModels[name];
        if (!model) return;

        if ((model.type || 'image') === 'audio') return this._loadAudioModelToEdit(model);
        if (!this._classifier) return;

        this._classifier.clearAllClasses();
        if (window.tf) {
            const dataset = {};
            for (const label in model.dataset) {
                const {data, shape} = model.dataset[label];
                dataset[label] = window.tf.tensor2d(data, shape);
            }
            this._classifier.setClassifierDataset(dataset);
        }

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

    async _loadAudioModelToEdit (model) {
        if (!this._baseRecognizer) return;
        this._audioStopListen();
        try {
            this._transferRecognizer = this._baseRecognizer.createTransfer(model.name);
            this._transferRecognizer.loadExamples(base64ToAb(model.audioData));
            const counts = this._transferRecognizer.countExamples() || {};
            this.setState({
                modelName: model.name,
                classes: model.classes.map(c => ({
                    name: c.name,
                    isNoise: !!c.isNoise,
                    sampleCount: counts[c.label] || 0,
                    thumbnails: []
                })),
                isTraining: true,
                trainProgress: 0
            });
            await new Promise(r => setTimeout(r, 60));
            await this._transferRecognizer.train({
                epochs: AUDIO_EPOCHS,
                fineTuningEpochs: AUDIO_FINETUNE_EPOCHS,
                augmentByMixingNoiseRatio: AUDIO_NOISE_MIX,
                callback: {
                    onEpochEnd: epoch => {
                        this._safeSetState({trainProgress: Math.round(((epoch + 1) / AUDIO_EPOCHS) * 85)});
                    }
                },
                fineTuningCallback: {
                    onEpochEnd: epoch => {
                        this._safeSetState({trainProgress: 85 + Math.round(((epoch + 1) / AUDIO_FINETUNE_EPOCHS) * 15)});
                    }
                }
            });
            this._safeSetState({isTraining: false, isTrained: true, trainProgress: 100});
            if (this._mounted) this._audioStartListen();
        } catch (e) {
            console.error('[MLStudio] Error cargando modelo de audio:', e);
            this._safeSetState({isTraining: false});
        }
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
        if (this.state.classes[index].isNoise) return;
        this.setState(prev => ({
            classes: prev.classes.filter((_, i) => i !== index),
            isTrained: false,
            liveConfidences: {},
            topClassIndex: null
        }));
        if (this._classifier) this._classifier.clearAllClasses();
        clearInterval(this._predictTimer);
        this._audioStopListen();
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
        this._audioStopListen();
    }

    // ─── Render: pantalla de selección ──────────────────────────────────────────

    _renderChooser () {
        return (
            <div className={styles.overlay}>
                <div className={styles.modal}>
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
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
                                    <span className={styles.chooserDot} style={{background: t.color}}>
                                        {t.short}
                                    </span>
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

    // ─── Render: card de clase ──────────────────────────────────────────────────

    _renderClassCard (cls, idx) {
        const {capturingClass, libLoaded, projectType} = this.state;
        const color = CLASS_COLORS[idx % CLASS_COLORS.length];
        const isCapturing = capturingClass === idx;
        const isAudio = projectType === 'audio';
        const isPose = projectType === 'pose';
        const unit = isAudio ? 'sonido' : (isPose ? 'pose' : 'imagen');

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
                    {cls.isNoise ? (
                        <span className={styles.classNoiseName}>{cls.name}</span>
                    ) : (
                        <input
                            className={styles.classNameInput}
                            value={cls.name}
                            onChange={e => this._renameClass(idx, e.target.value)}
                        />
                    )}
                    <div className={styles.classMenu}>
                        {cls.sampleCount > 0 && (
                            <button
                                className={styles.iconBtn}
                                onClick={() => this._clearClass(idx)}
                                title="Borrar muestras"
                            >↺</button>
                        )}
                        {this.state.classes.length > 2 && !cls.isNoise && (
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

                {isAudio ? (
                    <div className={styles.audioSamples}>
                        {cls.sampleCount === 0 ? (
                            <div className={styles.thumbsEmpty}>
                                Graba al menos {cls.isNoise ? '20' : '8'} muestras de {cls.isNoise ? 'ruido ambiente' : 'este sonido'}
                            </div>
                        ) : (
                            <div className={styles.audioDots}>
                                {Array.from({length: cls.sampleCount}).map((_, di) => (
                                    <span key={di} className={styles.audioDot} style={{background: color}} />
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={styles.thumbsGrid}>
                        {cls.thumbnails.length === 0 ? (
                            <div className={styles.thumbsEmpty}>
                                Mantén presionado el botón para capturar {unit === 'pose' ? 'poses' : 'imágenes'}
                            </div>
                        ) : cls.thumbnails.map((t, ti) => (
                            <img key={ti} src={t} className={styles.thumb} alt="" />
                        ))}
                    </div>
                )}

                {isAudio ? (
                    <button
                        className={classNames(styles.recordBtn, {
                            [styles.recordBtnActive]: isCapturing
                        })}
                        style={!isCapturing && libLoaded ? {background: color} : {}}
                        onPointerDown={e => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            this._audioStartCapture(idx);
                        }}
                        onPointerUp={() => this._audioStopCapture()}
                        onPointerCancel={() => this._audioStopCapture()}
                        disabled={!libLoaded || (capturingClass !== null && !isCapturing)}
                    >
                        {isCapturing ? 'Grabando...' : 'Mantén para grabar'}
                    </button>
                ) : (
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
                        {isCapturing ? 'Capturando...' : 'Mantén para capturar'}
                    </button>
                )}
            </div>
        );
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    render () {
        const {
            projectType, modelName, classes, isTrained, isTraining, trainProgress, capturingClass,
            liveConfidences, topClassIndex, cameraReady, micReady, libLoaded, libLoading,
            savedModels, saveNotice
        } = this.state;

        if (!projectType) return this._renderChooser();

        const isAudio = projectType === 'audio';
        const isPose = projectType === 'pose';
        const typeShort = isAudio ? 'Audio' : (isPose ? 'Pose' : 'Imagen');
        const inputReady = isAudio ? micReady : cameraReady;

        const savedList = Object.values(savedModels).filter(
            m => (m.type || 'image') === projectType
        );
        const audioMin = c => (c.isNoise ? AUDIO_MIN_NOISE : AUDIO_MIN_SAMPLES);
        const canTrain = libLoaded && classes.length >= 2 && (
            isAudio ?
                classes.every(c => c.sampleCount >= audioMin(c)) :
                classes.every(c => c.sampleCount >= 2)
        );

        return (
            <div className={styles.overlay}>
                <div className={styles.modal}>

                    {/* ── Header ── */}
                    <div className={styles.header}>
                        <div className={styles.headerLeft}>
                            <span className={styles.headerTitle}>ML Studio</span>
                            <span className={styles.headerBadge}>
                                {typeShort}
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
                                            <span className={styles.spinner} />
                                            {isAudio ?
                                                (trainProgress > 0 ?
                                                    `Entrenando... ${trainProgress}%` :
                                                    'Preparando entrenamiento...') :
                                                'Entrenando...'}
                                        </span>
                                    ) : 'Entrenar modelo'}
                                </button>

                                {isAudio && isTraining && (
                                    <div className={styles.audioProgressTrack}>
                                        <div
                                            className={styles.audioProgressFill}
                                            style={{width: `${trainProgress}%`}}
                                        />
                                    </div>
                                )}

                                {!canTrain && libLoaded && (
                                    <div className={styles.trainHint}>
                                        {isAudio ? (
                                            <span>Graba <b>8 muestras</b> de cada sonido (~2s) y <b>20 muestras</b> de ruido de fondo (~1s).</span>
                                        ) : (
                                            <span>Captura al menos <b>2 muestras</b> en cada clase para poder entrenar.</span>
                                        )}
                                    </div>
                                )}
                                {libLoading && (
                                    <div className={styles.trainHint}>
                                        Cargando {isAudio ? 'Speech Commands' : (isPose ? 'PoseNet' : 'TensorFlow.js')}...
                                    </div>
                                )}
                                {isTrained && (
                                    <div className={styles.trainedBadge}>
                                        Modelo entrenado y listo
                                    </div>
                                )}

                                {isTrained && (
                                    <button className={styles.saveBtn} onClick={() => this._saveModel()}>
                                        Guardar modelo
                                    </button>
                                )}
                                {saveNotice && (
                                    <div className={styles.saveNotice}>{saveNotice}</div>
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
                                {isAudio ? (
                                    <div className={classNames(styles.cameraWrap, styles.audioWrap, {
                                        [styles.cameraWrapLive]: micReady
                                    })}>
                                        <canvas
                                            ref={this.audioVizRef}
                                            width={480}
                                            height={200}
                                            className={styles.audioViz}
                                        />
                                        {!micReady && (
                                            <div className={styles.cameraOverlay}>
                                                <span className={styles.cameraOverlayDot} />
                                                Activando micrófono...
                                            </div>
                                        )}
                                        {micReady && (
                                            <div className={styles.cameraLiveBadge}>
                                                <span className={styles.cameraLiveDot} />
                                                Escuchando
                                            </div>
                                        )}
                                        {capturingClass !== null && (
                                            <div className={styles.cameraCapturingRing} />
                                        )}
                                    </div>
                                ) : (
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
                                )}

                                {/* Barras de confianza */}
                                <div className={styles.outputSection}>
                                    <div className={styles.outputTitle}>Salida</div>
                                    {!isTrained ? (
                                        <div className={styles.outputEmpty}>
                                            {inputReady ?
                                                'Entrena el modelo para ver las predicciones en vivo' :
                                                'Esperando el sensor...'}
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
