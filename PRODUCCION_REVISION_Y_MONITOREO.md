# PlayCode — Revisión de Producción Estable y Monitoreo en Campo

> **Para:** la instancia de Claude que corre en el servidor de producción (AWS Lightsail).
> **Objetivo:** (1) confirmar que estás mirando la versión **ESTABLE de producción** y no staging, (2) revisar la salud de producción antes de una prueba de campo, y (3) preparar y ejecutar el monitoreo mientras usuarios reales entran a PlayCode.
> **Última actualización:** 2026-07-29

---

## 0. Contexto crítico: hay DOS entornos, no los confundas

Existen dos clones/entornos del mismo proyecto. **No mezclarlos es lo más importante de este documento.**

| Entorno | Rama | Contenido | Se usa para |
|---|---|---|---|
| **PRODUCCIÓN** (este servidor) | `main` | Scratch + **PlayIoT** + PlayMe. Estable, congelado. | La prueba de campo. `playcode.tdrobotica.co` |
| **STAGING** (otro clon, máquina de desarrollo) | `feature/teachable-machine` | Trabajo experimental: **PlayGo**, transporte BLE, Teachable Machine, servos, etc. | Desarrollo. **NADA de esto debe estar en producción.** |

Si en este servidor aparece cualquier rastro de **PlayGo**, **BLE**, **Teachable Machine** o la rama `feature/teachable-machine`, entonces **se desplegó la rama equivocada** y NO debe usarse para la prueba. Ver §2.

---

## 1. Identidad de la versión estable de producción

Fecha de corte del código: **28 de mayo de 2026**. Estos son los commits exactos que constituyen "producción estable":

| Componente | Rama | Commit | Versión | Fecha |
|---|---|---|---|---|
| **scratch-gui** (frontend) | `main` | `36486947` (`364869475e73d9f3d6ce2e5af60f8c96057520b1`) | 5.2.13 | 2026-05-28 |
| **scratch-vm** (backend/VM) | `main` | `b13d6b90` (`b13d6b909e8abf703dead7aaf4e0b82d9a18878c`) | 5.0.300 | 2026-05-28 |

**Entorno del servidor (según guía de despliegue):**
- Node **v22.13.1**, Ubuntu **24.04.4 LTS**
- Puertos: GUI `8601`, VM `8073` (detrás de Nginx en `playcode.tdrobotica.co`)
- Gestor de procesos: **PM2** (apps esperadas: `playcode-gui`, `playcode-vm`)

**Dispositivos y extensiones soportadas en producción:**
- Dispositivos hardware: **PlayIoT R2**, **PlayMe 1**
- Extensiones registradas en el VM (`src/extension-support/extension-manager.js`): **solo `playiot` y `playme`** + las extensiones estándar de Scratch (pen, music, microbit, ev3, etc.)
- **PlayIoT es el dispositivo precargado por defecto** en el panel (`playiot_1`).

**Lo que NO existe en producción (y no debe existir):** extensión `playgo`, transporte Bluetooth/BLE (`playgo-ble.js`), extensión `teachablemachine`, eventos `PERIPHERAL_RECONNECTING`, toasts de "Reconectando dispositivo".

---

## 2. Guardia anti-confusión: ¿estoy en producción o en staging?

Ejecuta esto en el servidor (ajusta las rutas si difieren de `/opt/playcode`):

```bash
cd /opt/playcode/scratch-gui && echo "GUI: $(git branch --show-current) @ $(git rev-parse --short HEAD)"
cd /opt/playcode/scratch-vm  && echo "VM:  $(git branch --show-current) @ $(git rev-parse --short HEAD)"

# ¿Existe PlayGo? (NO debe existir en producción)
ls /opt/playcode/scratch-vm/src/extensions/ | grep -E 'playgo|teachable' || echo "OK: sin playgo/teachable"

# ¿Qué extensiones de dispositivo están registradas?
grep -E 'playiot|playme|playgo' /opt/playcode/scratch-vm/src/extension-support/extension-manager.js
```

✅ **Es PRODUCCIÓN (correcto)** si:
- Ambos repos dicen rama `main`.
- GUI = `36486947`, VM = `b13d6b90` (o commits **posteriores en `main`** si se aprobó una actualización estable; nunca de otra rama).
- `grep` NO encuentra `playgo`; solo `playiot` y `playme`.

🚨 **ALARMA — NO usar para la prueba** si:
- Alguna rama dice `feature/teachable-machine` (u otra que no sea `main`).
- Existe la carpeta `src/extensions/playgo/`.
- Aparece la extensión "PlayGo" en el panel de dispositivos o toasts de "Reconectando".

> Si hay alarma: `git checkout main` en ambos repos, reinstalar/rebuild y reiniciar (ver §8). No improvises con la rama de staging en producción.

---

## 3. Revisión de salud de producción (correr ANTES de la prueba)

```bash
# --- 3.1 Rama y commit correctos (ver §2) ---

# --- 3.2 Build presente y fresco ---
ls -la /opt/playcode/scratch-gui/build/index.html && \
  stat -c 'Build generado: %y' /opt/playcode/scratch-gui/build/index.html

# --- 3.3 PM2: ambos procesos "online", sin crash-loop ---
pm2 status
#   Revisar: status=online en ambos; columna "↺" (restarts) NO subiendo sola.

# --- 3.4 Puertos escuchando ---
sudo ss -ltnp | grep -E ':8601|:8073' || echo "⚠ Falta algún puerto (8601 GUI / 8073 VM)"

# --- 3.5 Nginx activo + config válida + certificado SSL ---
sudo nginx -t
systemctl is-active nginx
echo | openssl s_client -servername playcode.tdrobotica.co \
  -connect playcode.tdrobotica.co:443 2>/dev/null | openssl x509 -noout -dates

# --- 3.6 Recursos con holgura ---
df -h /            # disco: idealmente < 85% usado
free -h            # RAM: que haya ~1GB+ libre/available
uptime             # load average: idealmente < 2 (hay 2 vCPU)

# --- 3.7 Variables de entorno de producción ---
grep -E 'NODE_ENV|URL' /opt/playcode/.env
#   Debe decir NODE_ENV=production y URLs de https://...tdrobotica.co (NO localhost)

# --- 3.8 Smoke test HTTP ---
curl -I -s https://playcode.tdrobotica.co | head -1   # esperado: HTTP/… 200
```

Si los 8 pasos están en verde, producción está lista.

---

## 4. Qué SÍ y qué NO ve el servidor (clave para monitorear lo correcto)

**PlayIoT se conecta por USB usando Web Serial, que corre en el NAVEGADOR del usuario, no en el servidor.** El servidor solo entrega la app (HTML/JS/CSS estático) y sirve archivos de firmware.

| El servidor **SÍ** ve | El servidor **NO** ve |
|---|---|
| Cargas de página, requests HTTP, assets | La conexión USB de la placa |
| Concurrencia / cuántos usuarios entran | La telemetría del dispositivo |
| Errores del proceso Node / caídas de PM2 | Errores de bloques en el navegador |
| Uso de CPU/RAM/disco, ancho de banda | La consola del navegador del usuario (F12) |
| Descargas de firmware (si aplica) | Si un motor/LED respondió físicamente |

**Consecuencia práctica para la prueba:** los "errores cuando el niño conecta la placa o corre un bloque" aparecen en la **consola del navegador (F12 → Console)**, no en el servidor. Designa a alguien que, en 1–2 equipos de prueba, tenga **F12 abierto** para capturarlos. El monitoreo del servidor (este documento) cubre **estabilidad, concurrencia y errores del backend**.

---

## 5. Preparar el monitoreo del servidor (setup, una sola vez)

```bash
# --- 5.1 Rotación de logs de PM2 (que no llenen el disco durante la prueba) ---
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 10
pm2 set pm2-logrotate:compress true

# --- 5.2 Timestamps en los logs de PM2 ---
#   Si los logs no traen hora, reiniciar las apps con --time:
pm2 restart playcode-gui --time
pm2 restart playcode-vm  --time
pm2 save

# --- 5.3 Utilidades de monitoreo (si faltan) ---
sudo apt install -y htop jq

# --- 5.4 Confirmar rutas de logs de Nginx ---
ls -la /var/log/nginx/access.log /var/log/nginx/error.log
#   (si Nginx usa un vhost con log propio, ajusta las rutas en §6)
```

---

## 6. Monitoreo EN VIVO durante la prueba

Idealmente en varias terminales o paneles de `tmux`. Ajusta rutas/nombres a los reales del servidor.

**A) Logs de la aplicación en vivo**
```bash
pm2 logs --timestamp
```

**B) Recursos en vivo**
```bash
pm2 monit        # o:  htop
```

**C) Usuarios entrando (Nginx access log)**
```bash
# Stream crudo:
sudo tail -f /var/log/nginx/access.log

# IPs únicas en el último minuto (correr repetido, o con watch):
watch -n 10 "sudo awk -v d=\"\$(date -d '1 min ago' '+%d/%b/%Y:%H:%M')\" '\$0 ~ d' /var/log/nginx/access.log | awk '{print \$1}' | sort -u | wc -l"

# Requests por minuto (tasa aproximada):
watch -n 15 "sudo tail -n 2000 /var/log/nginx/access.log | awk '{print \$4}' | cut -d: -f1-3 | sort | uniq -c | tail -5"
```

**D) Errores**
```bash
# Errores de Nginx (5xx del backend, upstream caído, etc.):
sudo tail -f /var/log/nginx/error.log

# Respuestas 5xx en tiempo real (backend fallando):
sudo tail -f /var/log/nginx/access.log | grep --line-buffered -E ' 5[0-9][0-9] '

# Solo el stream de errores del proceso Node:
pm2 logs --err --timestamp
```

**E) Tablero rápido (script de resumen)** — guárdalo como `~/monitor.sh` y córrelo con `watch -n 15 bash ~/monitor.sh`:
```bash
#!/usr/bin/env bash
echo "===== PlayCode monitor — $(date '+%F %T') ====="
echo "--- PM2 ---"
pm2 jlist | jq -r '.[] | "\(.name)  estado=\(.pm2_env.status)  reinicios=\(.pm2_env.restart_time)  cpu=\(.monit.cpu)%  mem=\(.monit.memory/1024/1024|floor)MB"' 2>/dev/null || pm2 status
echo "--- Recursos ---"
printf "Disco /: "; df -h / | awk 'NR==2{print $5" usado ("$4" libre)"}'
printf "RAM: ";      free -m | awk 'NR==2{print $3"MB usados / "$2"MB ("$7"MB disp.)"}'
printf "Load: ";     uptime | sed 's/.*load average: //'
echo "--- Conexiones HTTP activas (443) ---"
sudo ss -tn state established '( sport = :443 )' 2>/dev/null | tail -n +2 | wc -l
echo "--- Últimos 5xx (Nginx, últimas 200 líneas) ---"
sudo tail -n 200 /var/log/nginx/access.log 2>/dev/null | grep -cE ' 5[0-9][0-9] ' | xargs echo "conteo 5xx:"
```

---

## 7. Umbrales — qué vigilar y cuándo preocuparse

| Señal | OK | Atención | Acción |
|---|---|---|---|
| RAM disponible | > 1 GB | < 500 MB sostenido | Ver §8; considerar reiniciar app |
| Disco `/` | < 85% | > 90% | `pm2 flush`, rotar/limpiar logs |
| Load average | < 2 | > 4 sostenido (2 vCPU) | App lenta; revisar procesos |
| PM2 restarts | estable | subiendo solos | Crash-loop → `pm2 logs --err` |
| 5xx en Nginx | 0 | aparecen | Backend caído → `pm2 status`/logs |
| PM2 status | `online` | `errored`/`stopped` | Reiniciar (ver §8) |

---

## 8. Respuesta a incidentes — comandos de emergencia

```bash
# Reiniciar la aplicación (primer recurso):
pm2 restart all

# ¿Por qué se cayó? (últimas líneas de error):
pm2 logs --err --lines 100

# Recargar Nginx tras validar config:
sudo nginx -t && sudo systemctl reload nginx

# Liberar espacio en disco (logs de PM2):
pm2 flush

# ROLLBACK a la versión estable conocida (SOLO si se desplegó algo malo).
# Reemplaza <commit> por el de §1 (GUI=36486947, VM=b13d6b90):
cd /opt/playcode/scratch-gui && git fetch origin && git checkout main && git reset --hard 36486947
cd /opt/playcode/scratch-vm  && git fetch origin && git checkout main && git reset --hard b13d6b90
cd /opt/playcode && npm run build && pm2 restart all
```

> **Recomendado antes de la prueba:** tomar un **snapshot de AWS Lightsail** de la instancia. Si algo se rompe irremediablemente en campo, restaurar el snapshot es el camino más rápido de vuelta a un estado bueno.

---

## 9. Cierre y post-prueba

```bash
# Guardar los logs de la sesión de prueba:
pm2 logs --nostream --lines 5000 > ~/prueba_campo_$(date +%F_%H%M).log

# Copiar el access log del periodo de la prueba:
sudo cp /var/log/nginx/access.log ~/nginx_access_prueba_$(date +%F).log
```

Anota: hora de inicio/fin, número aproximado de usuarios concurrentes, cualquier 5xx o reinicio de PM2, y (de los equipos con F12 abierto) errores de navegador vistos al conectar PlayIoT o correr bloques. Eso alimenta la siguiente iteración.

---

*Documento generado para la revisión de producción y el monitoreo de la prueba de campo (Scratch + PlayIoT). Vive en la rama `main`. La versión estable de referencia es la del corte 2026-05-28 descrita en §1.*
