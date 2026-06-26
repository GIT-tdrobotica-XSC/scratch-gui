# Contexto: Teachable Machine / ML Studio en PlayCode

**Rama:** `feature/teachable-machine`  
**Repos:** `GIT-tdrobotica-XSC/scratch-gui` · `GIT-tdrobotica-XSC/scratch-vm`  
**Estado:** Implementado y commiteado en rama feature. Main limpio (producción no afectada).

---

## Qué es

Sistema completo de machine learning in-browser integrado dentro de PlayCode. Permite a los usuarios crear modelos sin salir de la app: crean clases, capturan muestras, entrenan y usan el modelo con bloques Scratch. No depende de ningún servicio externo (todo corre en el browser).

Al abrir ML Studio aparece una **pantalla de selección de tipo de proyecto** (estilo Google TM):
- **Imagen** ✅ — reconoce objetos/gestos con MobileNet + KNN
- **Pose** ✅ — reconoce posturas del cuerpo con PoseNet (17 keypoints) + KNN
- **Audio** ✅ — reconoce sonidos con Speech Commands (transfer learning)

Tecnología: **MobileNet**/**PoseNet** + **KNN Classifier** (imagen/pose) o **Speech Commands** (audio), todo de TensorFlow.js, cargado desde CDN según el tipo de proyecto.

### Soporte de Audio
- **Stack aislado: tfjs 1.5.2 + `@tensorflow-models/speech-commands@0.4.2`** (el stack 1.x de Google TM). speech-commands con tfjs 3.x **falla al compilar shaders en WebGL**; con tfjs 1.x funciona. Coexiste con tfjs 3.21 (imagen/pose) porque cada librería captura su propio `tf` al cargarse y el código usa `this._tf`.
- BROWSER_FFT base + transfer learning sobre espectrogramas. **No usa KNN.**
- Un solo flujo de micrófono: el preview (AnalyserNode) se **libera** antes de cada `collectExample`/`train`/`listen` para no competir por el micrófono (evita que no grabe bien). El visualizador usa el espectro REAL vía `onSnippet` (captura) y `result.spectrogram` (escucha).
- Clase obligatoria **"Ruido de fondo"** (`_background_noise_`); se graba en tramos de 4s (`durationSec`).
- Captura: **mantener presionado** graba varias muestras de ~1s seguidas (más datos = mejor modelo).
- **Precisión como Google TM**: `train({epochs:40, fineTuningEpochs:8, augmentByMixingNoiseRatio:0.5})` — el augment mezcla ruido de fondo en las muestras (robustez) y el fine-tuning ajusta capas profundas.
- Inferencia: `listen()` con `probabilityThreshold:0.5` + `invokeCallbackOnNoiseAndUnknown:true` (reporte continuo para que los bloques respondan).
- Guardado: `serializeExamples()` → base64 en `audioData`. Al cargar: `loadExamples()` + re-`train()`.
- En la VM, `loadModel` con `type:'audio'` reconstruye el recognizer, re-entrena con los mismos params y arranca `listen()`; el callback alimenta `_topClass`/`_allConfidences`.

### Soporte de Pose
- Extractor: **MoveNet** vía `@tensorflow-models/pose-detection@2.1.0` (SINGLEPOSE_LIGHTNING). Se migró desde PoseNet 2.2.2 porque era **incompatible con tfjs 3.21** (fallaba en silencio). MoveNet es compatible y más preciso.
- Keypoints MoveNet: `{x, y, score, name}` (17 puntos COCO). `_poseToVector()` filtra puntos con score < 0.2 y descarta el frame si hay < 5 válidos (evita basura cuando no hay persona).
- Features: 17 keypoints → vector de 34 dims normalizado por bounding box de la pose (invariante a traslación y escala). Mismo `_poseToVector()` en GUI y VM para que los modelos sean compatibles.
- Esqueleto: `poseDetection.util.getAdjacentPairs(MoveNet)` para los huesos. `tf.ready()` antes de `createDetector`.
- El KNN, el suavizado temporal, el guardado y los bloques **se reutilizan igual** que en imagen; solo cambia el extractor de features.
- En ML Studio se dibuja el **esqueleto** sobre la cámara (canvas overlay espejado). Un rAF loop estima la pose continuamente, guarda `_lastPoseVec` y dibuja; captura y predicción reusan ese vector.
- Cada modelo guardado lleva `type: 'image' | 'pose'`. La extensión VM ramifica en `loadModel` según `model.type` y carga PoseNet o MobileNet. Modelos sin `type` se asumen `image` (retrocompat).

---

## Arquitectura general

```
[Bloques Scratch TM]
    → botón "Abrir ML Studio" en categoría TM
    → runtime.emit('OPEN_ML_STUDIO')
    → gui.jsx escucha → abre <MLStudio />

[ML Studio Panel]
    → cámara propia (640×480, getUserMedia)
    → MobileNet extrae features (1024 dims)
    → KNN guarda muestras por clase
    → guarda en localStorage (playcode_ml_models)
    → window.playcodeMLModels (acceso runtime)
    → emite ML_MODELS_UPDATED al guardar

[Extensión TM - bloques de inferencia]
    → video oculto (position:fixed;top:-9999px)
    → cámara independiente getUserMedia
    → MobileNet + KNN desde CDN
    → suavizado temporal (8 frames)
    → k adaptativo
    → emite TM_CAMERA_STARTED(stream)

[TmCameraWidget en GUI]
    → video flotante 160×120px bottom-right
    → feed del stream de la extensión
    → soporte flip/espejo
```

---

## Archivos nuevos — scratch-gui

### `src/components/ml-studio/ml-studio.jsx`
Componente React (clase) del panel ML Studio.

**Estado interno:**
- `classes[]` — array de clases, cada una con `{name, samples[], thumbnails[]}`
- `cameraOn` — stream de cámara activo
- `isTraining` — flag visual de entrenamiento
- `isPredicting` — loop de inferencia activo
- `predictions{}` — mapa clase→confianza (0-1)
- `knnClassifier`, `mobilenet` — instancias TF.js

**Métodos clave:**
- `_loadLibraries()` — inyecta TF.js → MobileNet → KNN desde CDN (singleton con `data-loaded`)
- `_startCamera()` — getUserMedia 640×480
- `_captureFrame(classIndex)` — extrae features MobileNet, guarda en KNN, genera thumbnail 100×75px
- `_startCapture/_stopCapture()` — captura continua cada 120ms mientras el botón está presionado
- `_train()` — delay visual 500ms (KNN training es instantáneo)
- `_startPredictLoop()` — inferencia continua, suavizado 8 frames, k adaptativo
- `_saveModel()` — serializa dataset KNN a localStorage + `window.playcodeMLModels` + emite `ML_MODELS_UPDATED`
- `_loadModelToEdit(name)` — carga modelo guardado para re-editar clases
- `_readStorage()/_writeStorage()` — persistencia localStorage key: `playcode_ml_models`

**Layout:** 3 columnas — Clases | Entrenamiento | Preview  
**Colores por clase:** paleta de 8 colores ciclando por índice  
**Preview:** barras de confianza animadas (`width 0.18s ease-out`)

### `src/components/ml-studio/ml-studio.css`
- Modal 1180px wide, 88vh height, border-radius 16px
- Header gradiente `#4c97ff → #4280e0`
- Cards de clase con borde superior de color, thumbnails en grid
- Botón grabar con animación `@keyframes pulse` (glow rojo)
- Barras de confianza con transición suave

### `src/lib/libraries/extensions/teachablemachine/index.jsx`
Metadata de la extensión para la librería:
```js
{
    name: 'Teachable Machine',
    extensionId: 'teachablemachine',
    collaborator: 'Google + TDRobotica',
    iconURL: teachablemachineIconURL,       // teachablemachine.svg
    insetIconURL: teachablemachineInsetIconURL, // teachablemachine-small.svg
    description: 'Reconoce imágenes con la cámara usando modelos entrenados en ML Studio',
    featured: true,
    internetConnectionRequired: true
}
```

### `src/lib/libraries/extensions/index.jsx`
**Modificado:** exporta SOLO `[teachablemachine]`. PlayIoT y PlayMe quedan en el panel de dispositivos, no en la librería de extensiones.

### `src/components/gui/gui.jsx`
**Modificado:**
- Import `MLStudio` desde `ml-studio/ml-studio.jsx`
- Estado: `mlStudioOpen`, `tmCameraStream`, `tmVideoFlipped`
- `useEffect` escucha eventos de runtime:
  - `OPEN_ML_STUDIO` → `setMlStudioOpen(true)`
  - `TM_CAMERA_STARTED(stream)` → guarda stream
  - `TM_CAMERA_STOPPED` → limpia stream
  - `TM_VIDEO_FLIP(bool)` → actualiza flip
- `TmCameraWidget` — componente inline, `<video>` 160×120px `position:fixed` bottom-right, `scaleX(-1)` si flipped
- `{mlStudioOpen && <MLStudio onClose={() => setMlStudioOpen(false)} />}`

### `src/containers/blocks.jsx`
**Modificado:** registra callback del botón:
```js
toolboxWorkspace.registerButtonCallback('OPEN_ML_STUDIO', () => {
    this.props.vm.runtime.emit('OPEN_ML_STUDIO');
});
```

---

## Archivos nuevos — scratch-vm

### `src/extensions/teachablemachine/index.js`
Extensión completa de Scratch para inferencia.

**Estado:**
- `_smoothingWindow = 8` — frames para suavizado temporal
- `_confidenceBuffer = []` — historial de vectores de confianza
- `_knnK = 3` — k adaptativo
- `_videoFlipped = true` — espejo por defecto
- `_classifyInterval` — intervalo del loop de predicción

**Métodos clave:**
- `_loadLibrary()` — inyecta CDN: TF.js → MobileNet → KNN (mismo orden que ML Studio, mismo singleton)
- `_ensureVideoElement()` — crea `<video>` oculto `position:fixed;top:-9999px` para inferencia
- `_enableCamera()` — getUserMedia, guarda stream, emite `TM_CAMERA_STARTED(stream)`
- `_disableCamera()` — detiene tracks, emite `TM_CAMERA_STOPPED`
- `_startPredictLoop()` — suavizado 8 frames + k adaptativo, mapea confianzas a nombres de clase
- `loadModel(args)` — reconstruye KNN desde `window.playcodeMLModels` (localStorage → tensor), calcula k adaptativo, arranca cámara + loop

**Bloques:**
| Bloque | Tipo | Descripción |
|--------|------|-------------|
| `🤖 Abrir ML Studio` | BUTTON | Abre el panel ML Studio |
| `cargar modelo [MODEL]` | COMMAND | Carga modelo y activa cámara |
| `clase detectada` | REPORTER | Nombre de clase con mayor confianza |
| `confianza de [CLASS]` | REPORTER | Confianza 0-100 de una clase |
| `cuando detecta [CLASS]` | HAT | Evento cuando detecta clase |
| `cuando detecta [CLASS] con confianza > [N]%` | HAT | Evento con umbral de confianza |
| `activar/apagar/voltear cámara` | COMMAND | Control de video |
| `intervalo de clasificación [N] ms` | COMMAND | Ajusta frecuencia de inferencia |

**Menú videoStates:** encender / apagar / voltear (espejo) / sin voltear

### `src/engine/runtime.js`
**Modificado:** agrega `'OPEN_ML_STUDIO'` al array `supportedCallbackKeys` en `_convertButtonForScratchBlocks()`. Sin esto el botón no dispara el callback.

### `src/extension-support/extension-manager.js`
**Modificado:** agrega entrada:
```js
teachablemachine: () => require('../extensions/teachablemachine')
```

---

## Precisión del modelo

**Suavizado temporal:** promedio de los últimos 8 vectores de confianza antes de reportar → elimina flickering entre frames.

**K adaptativo:**
```js
k = max(3, min(10, floor(minSamplesPerClass / 2)))
```
Ajusta automáticamente según cuántas muestras tiene la clase con menos ejemplos.

**MobileNet config:** versión 1, `alpha: 0.25`, `infer(video, true)` = capa de embedding = vector 1024 dims. Idéntico en ML Studio y en la extensión → los modelos guardados son compatibles.

---

## Persistencia de modelos

- **Key localStorage:** `playcode_ml_models`
- **Formato:** `{ [modelName]: { classes: [...], dataset: { [label]: {data: Float32Array, shape: [n,1024]} } } }`
- **Runtime:** `window.playcodeMLModels` — objeto compartido entre ML Studio (GUI) y la extensión (VM)
- **Evento de sync:** `runtime.emit('ML_MODELS_UPDATED')` al guardar → la extensión actualiza su lista de modelos disponibles
- **Por dominio:** localStorage es por origen, así que staging y producción tienen stores separados

---

## Bus de eventos (runtime)

| Evento | Dirección | Payload |
|--------|-----------|---------|
| `OPEN_ML_STUDIO` | blocks.jsx → gui.jsx | — |
| `ML_MODELS_UPDATED` | ml-studio → extensión | — |
| `TM_CAMERA_STARTED` | extensión → gui.jsx | `stream` (MediaStream) |
| `TM_CAMERA_STOPPED` | extensión → gui.jsx | — |
| `TM_VIDEO_FLIP` | extensión → gui.jsx | `bool` |

---

## Flujo de uso completo

1. Usuario agrega extensión "Teachable Machine" desde "+"
2. En la categoría TM aparece botón "Abrir ML Studio"
3. En ML Studio: crea clases, mantiene "Grabar" para capturar muestras (120ms/frame)
4. Click "Entrenar" → modelo listo en <1s
5. Click "Guardar modelo" → persiste en localStorage, disponible para bloques
6. En bloques: "cargar modelo [nombre]" → activa cámara, aparece widget flotante
7. Bloques de inferencia funcionan en tiempo real con suavizado

---

## Consideraciones de despliegue

- **HTTPS obligatorio:** `getUserMedia` (cámara) solo funciona en HTTPS o localhost
- **CDN requerido:** TF.js, MobileNet y KNN-classifier se cargan desde CDN en tiempo de ejecución. Sin internet no funciona el entrenamiento ni la inferencia
- **RAM:** MobileNet carga ~8MB en memoria del browser
- **Compatible con staging:** modelos en localStorage son por origen (dominio), staging tiene su propio store

---

## Commits en feature/teachable-machine

**scratch-vm** (`a43e1f1e`):
```
feat: agregar teachable machine con ml studio (knn + mobilenet, suavizado, bloques)
```
Archivos: `extensions/teachablemachine/index.js`, `engine/runtime.js`, `extension-support/extension-manager.js`

**scratch-gui** (`5234ddfc`):
```
feat: agregar ml studio y extension teachable machine
```
Archivos: `ml-studio/ml-studio.jsx`, `ml-studio/ml-studio.css`, `extensions/teachablemachine/index.jsx`, `extensions/teachablemachine/*.svg`, `gui/gui.jsx`, `containers/blocks.jsx`, `libraries/extensions/index.jsx`
