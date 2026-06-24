# Contexto General: PlayCode

**Organización GitHub:** `GIT-tdrobotica-XSC`  
**Repos:** `scratch-gui` · `scratch-vm`  
**Servidor:** AWS Lightsail — Ubuntu 24.04 LTS, 8GB RAM, 2vCPU  
**Dominio producción:** `playcode.tdrobotica.co`  
**Email/identidad git:** `git@tdrobotica.co`  
**SSH key:** `~/.ssh/id_ed25519_tdrobotica`

---

## Qué es PlayCode

Fork de Scratch 3.0 adaptado para IoT y educación con hardware ESP32. Permite programar dispositivos físicos (PlayIoT, PlayMe) con bloques visuales desde el browser, sin instalar nada. Incluye flasher de firmware integrado y (en rama feature) reconocimiento de imágenes con ML.

---

## Arquitectura del servidor

```
/opt/playcode/               ← directorio de producción (rama: main)
  scratch-gui/               ← Frontend React/Redux
    src/                     ← código fuente
    build/                   ← output compilado (estático)
  scratch-vm/                ← VM Node.js (motor de bloques)
    src/

PM2:
  playcode-gui  → puerto 8601  (frontend)
  playcode-vm   → puerto 8073  (VM API)

Nginx → playcode.tdrobotica.co → :8601 / :8073
Node.js v22.13.1
```

**Flujo de deploy:**
```
git pull origin main → npm install → npm run build → pm2 restart all
```

Los builds de scratch-gui consumen ~3-4GB RAM. Usar `NODE_OPTIONS=--max_old_space_size=4096`.

---

## Estructura del código

### scratch-gui (Frontend)
```
src/
  components/
    gui/
      gui.jsx                  ← componente raíz, monta todo
      SerialContext.js          ← contexto React para puerto serial
    sprite-selector/
      sprite-selector.jsx       ← panel izquierdo (sprites + dispositivos)
      device-panel.jsx          ← panel de dispositivos (PlayIoT, PlayMe)
      device-panel.css
      firmware-updater-modal.jsx ← flasher de firmware (esptool-js)
      firmware-updater-modal.css
    firmware-updater/
      UpdaterModal.jsx          ← versión antigua/abandonada (no usar)
    ml-studio/                  ← [feature/teachable-machine] ML Studio
      ml-studio.jsx
      ml-studio.css
  containers/
    blocks.jsx                  ← toolbar de bloques, registra callbacks
    costume-tab.jsx
  lib/
    libraries/
      extensions/
        index.jsx               ← lista de extensiones en modal "+"
        playiot/index.jsx       ← metadata extensión PlayIoT
        playme/index.jsx        ← metadata extensión PlayMe
        teachablemachine/       ← [feature/tm] metadata TM
    keycloak.js                 ← auth (actualmente comentado, pendiente)
    keycloak-hoc.jsx
```

### scratch-vm (Motor de bloques)
```
src/
  extensions/
    playiot/
      blocks.js                 ← 48 bloques ESP32 (motores, RGB, OLED, joystick...)
      index.js                  ← entrada extensión PlayIoT
      playiot-serial.js         ← Web Serial @ 115200 baud
      updater.js                ← clase FirmwareUpdater (Web Serial directo)
    playme/
      blocks.js                 ← 30 bloques ESP32-S3 (GPIO, RGB, OLED, servo, motorDC)
      index.js
      playme-serial.js
    teachablemachine/           ← [feature/tm]
      index.js                  ← extensión KNN+MobileNet, bloques inferencia
  engine/
    runtime.js                  ← motor principal, supportedCallbackKeys
  extension-support/
    extension-manager.js        ← registro de extensiones
```

---

## Dispositivos soportados

### PlayIoT (ESP32 original)
- **Color:** azul `#3D5A80`
- **Comunicación:** Web Serial 115200 baud, protocolo JSON
- **Hardware:** 2 motores DC, 3 LEDs RGB, 3 servos, pantalla OLED 128×64, joystick, botones A/B, 4 entradas analógicas (POT, ADC33/34/35), 6 pines DIO
- **Bloques:** 48 bloques en 8 categorías: Salidas Digitales, Motores y PWM, RGB, Servos, Pantalla OLED, Botones, Entradas Analógicas, Joystick
- **Firmware:** flashea con botón BOOT presionado (modo bootloader manual)

### PlayMe (ESP32-S3)
- **Color:** rojo `#FF6B6B`
- **Versión firmware actual:** 1.1.0
- **Comunicación:** Web Serial 115200 baud, protocolo JSON, CH340 UART
- **Hardware:** GPIOs físicos (pins 1-38), 2 LEDs RGB, pantalla OLED, servo, motor DC, botones A/B, potenciómetro
- **Bloques:** 30 bloques en 6 categorías: Salidas Digitales, RGB, Pantalla OLED, Motores, Entradas Analógicas, Botones
- **Firmware:** reset automático vía RTS (no necesita botón BOOT)
- **Diferencia clave vs PlayIoT:** los GPIOs son flexibles (cualquier pin, el usuario los asigna). PlayIoT tiene pines fijos predefinidos.

---

## Flasher de firmware

**Implementado en:** `scratch-gui/src/components/sprite-selector/firmware-updater-modal.jsx`

**Tecnología:** `esptool-js` (npm) — implementación JS pura de esptool, corre en Chrome, sin instalación.

**Flujo:**
1. Descarga `bootloader.bin`, `partitions.bin`, `firmware.bin` desde `https://playcode.tdrobotica.co/firmware/{extension}/`
2. Conecta al ESP32 vía Web Serial (`navigator.serial`)
3. Usa `ESPLoader` + `Transport` de `esptool-js`
4. Escribe los 3 binarios en sus direcciones:
   - PlayMe (ESP32-S3): bootloader en `0x0000`
   - PlayIoT (ESP32): bootloader en `0x1000`
   - Partitions: `0x8000`, Firmware: `0x10000`
5. Reset post-flash: PlayMe vía RTS manual, PlayIoT vía `hard_reset`

**Importante:** `UpdaterModal.jsx` en `firmware-updater/` llama `localhost:5000` — es un archivo ABANDONADO de iteración anterior, no está en uso.

**Requiere HTTPS:** Web Serial solo funciona en HTTPS o localhost.

---

## Panel de dispositivos (UX)

Los dispositivos (PlayIoT, PlayMe) se gestionan desde el **panel izquierdo** de la UI (no desde la librería de extensiones "+"). El flujo es:
1. Panel lateral izquierdo → selector de dispositivo
2. Botón "Conectar" → Web Serial scan → usuario elige puerto
3. Botón "Actualizar firmware" → abre `FirmwareUpdaterModal`
4. El indicador de estado cambia según `PERIPHERAL_CONNECTED/DISCONNECTED`

La librería de extensiones "+" está reservada para extensiones de software (Teachable Machine, etc.).

---

## Detección de conflicto DIO (PlayIoT)

Sistema que detecta cuando el mismo pin se usa como entrada y salida simultáneamente:
- `window._playiotUsedDIOPins` (Set) — actualizado por la GUI al cambiar bloques
- Los menús de pines muestran `⚠ en uso` dinámicamente
- Pendiente de refinamiento (bugs: falso positivo en workspace vacío, menús sin `disable` visual completo)

---

## Autenticación

- Integración con **Keycloak** existente pero actualmente **comentada** en `render-gui.jsx`
- Plan: reemplazar con JWT sobre WordPress (`Login WordPress pendiente`)
- `keycloak.js` y `keycloak-hoc.jsx` están presentes pero inactivos

---

## Ramas de git

| Rama | Contenido | Deploy |
|------|-----------|--------|
| `main` | Producción limpia. PlayIoT + PlayMe | `playcode.tdrobotica.co` |
| `feature/teachable-machine` | Todo lo de ML Studio + extensión TM | `staging.playcode.tdrobotica.co` (pendiente) |

**Regla:** nunca mergear `feature/teachable-machine` a `main` sin revisión completa en staging.

---

## Staging (en configuración)

Ver `STAGING_SETUP_BRIEFING.md` para instrucciones completas. Resumen:
- Directorio: `/opt/playcode-staging/`
- GUI: puerto 8701, VM: puerto 8173
- Dominio: `staging.playcode.tdrobotica.co`
- **HTTPS obligatorio** (cámara TM + Web Serial)
- Firmware se descarga del mismo servidor de producción (sin cambios)

---

## Servidor de firmware externo

- **Dominio:** `firmware.tdrobotica.co`
- **Estructura:** `/firmware/{extension}/bootloader.bin`, `partitions.bin`, `firmware.bin`, `version.txt`
- **Versiones actuales:** PlayIoT R2, PlayMe 1.1.0
- Las extensiones consultan `version.txt` al conectar para detectar si el firmware está desactualizado

---

## Bloques por dispositivo — resumen rápido

**PlayIoT (48 bloques):**
- Salidas Digitales (2): digitalWrite, ledBlink
- Motores y PWM (4): analogWrite, motorRun, motorStop, allMotorsStop
- RGB (6): matrix visual, R/G/B, hex, apagar, todos
- Servos (3): ángulo, centro, barrido
- OLED (9): texto XY, emoji, línea, rect, círculo, pixel, display, clear
- Botones (2): booleano + HAT
- Analógicas (6): leer, mapear, reporters directos POT/ADC33/34/35
- Digitales IN (4): booleano + reporters DIO2/5/23
- Joystick (5): eje, límite, HAT, ángulo, distancia

**PlayMe (30 bloques):**
- Salidas Digitales (3): digital, quick on/off, PWM
- RGB (5): R/G/B, hex, preset color, apagar, todos
- OLED (9): texto, número con label, línea texto, clear, dirección I2C, texto XY, emoji, formas, display
- Motores (3): servo, motorDC, stop
- Analógicas (3): leer POT, mapear, umbral booleano
- Botones (1): presionado A/B
- Config (1): pinMode entrada/salida

---

## Documentación del proyecto

| Archivo | Contenido |
|---------|-----------|
| `DEPLOYMENT_GUIDE.md` | Instalación, setup, PM2, Nginx, troubleshooting |
| `INFRASTRUCTURE_DIAGRAM.md` | Diagrama de arquitectura, puertos, versiones |
| `USUARIO_MANUAL.md` | Manual de usuario final |
| `DOCUMENTATION_README.md` | Índice de documentación, versioning |
| `CREAR_GOOGLE_SHEETS.js` | Script para poblar Google Sheets con credenciales/infra |
| `STAGING_SETUP_BRIEFING.md` | Guía para montar entorno staging feature/teachable-machine |
| `CONTEXT_TEACHABLE_MACHINE.md` | Contexto técnico detallado de ML Studio / TM |
| `CONTEXT_PROYECTO_PLAYCODE.md` | Este archivo |

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 16, Redux, Webpack |
| VM (motor bloques) | Node.js, Scratch VM fork |
| Hardware comm | Web Serial API (`navigator.serial`) |
| Firmware flash | `esptool-js` (npm) + CDN binaries |
| ML (feature branch) | TensorFlow.js, MobileNet v1, KNN Classifier |
| Servidor | AWS Lightsail, Ubuntu 24.04 |
| Proxy | Nginx |
| Proceso manager | PM2 |
| Auth (pendiente) | WordPress JWT (reemplaza Keycloak) |
