# HireFlow HR — HTTPS Deployment Guide

## Why HTTPS is Mandatory
Modern web browsers (Chrome, Safari, Firefox, Edge) enforce the **Secure Context** standard for `navigator.mediaDevices.getUserMedia()`. 
- **Microphone access** (AI technical interview via OpenAI Realtime voice)
- **Camera + Microphone access** (HR video interview via LiveKit)

These hardware APIs are **completely blocked** on non-localhost origins unless served over `https://`. When accessing HireFlow from mobile phones or other devices on a local area network (e.g. `http://192.168.1.x:5173`), the browser will refuse camera and microphone requests with `NotAllowedError` or `SecurityError`.

Deploying with HTTPS ensures seamless operation for candidates and HR managers on any device.

---

## 1. Local HTTPS Testing (Self-Signed Certificates)

HireFlow includes automated certificate generators with **Subject Alternative Names (SAN)** for `localhost`, `127.0.0.1`, and `hireflow.local`.

### On Windows (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File .\src\nginx\generate_ssl_certs.ps1
```

### On Linux / macOS (Bash):
```bash
chmod +x ./src/nginx/generate_ssl_certs.sh
./src/nginx/generate_ssl_certs.sh
```

This places `cert.pem` and `key.pem` inside `src/nginx/certs/`.

---

## 2. Running the Full HTTPS Stack via Docker Compose

Run the pre-configured `docker-compose.https.yml` file:

```bash
cd src
docker compose -f docker-compose.https.yml up --build -d
```

### Services Started:
1. `db`: PostgreSQL 16 (with `btree_gist`)
2. `redis`: Redis 7 in-memory broker
3. `api`: Django REST Framework application (port 8000 internally)
4. `celery_worker`: Background CV processing & email dispatcher
5. `celery_beat`: Cron scheduler for deadline checking, no-shows, and daily 90-day retention cleanup
6. `client`: React + Vite SPA served via internal Nginx
7. `nginx`: Public reverse-proxy listening on ports **80** (HTTP redirect) and **443** (HTTPS)

### Accessing the App:
- Open your browser to: **`https://localhost`**
- Bypass the self-signed warning (click *Advanced* -> *Proceed to localhost*).
- Microphone and camera permissions will now be accepted!

---

## 3. Production Deployment with Let's Encrypt / Certbot

For production servers with a registered public domain (e.g., `hireflow.yourdomain.com`):

1. Update `src/nginx/nginx.conf` with your real domain:
   ```nginx
   server_name hireflow.yourdomain.com;
   ```
2. Request a free trusted certificate via Certbot:
   ```bash
   sudo certbot certonly --standalone -d hireflow.yourdomain.com
   ```
3. Symlink or copy the certificates:
   ```bash
   cp /etc/letsencrypt/live/hireflow.yourdomain.com/fullchain.pem src/nginx/certs/cert.pem
   cp /etc/letsencrypt/live/hireflow.yourdomain.com/privkey.pem src/nginx/certs/key.pem
   ```
4. Start the stack:
   ```bash
   docker compose -f docker-compose.https.yml up -d
   ```

---

## 4. Mobile LAN Testing (Testing on Phone over Wi-Fi)

To test the mobile candidate interview experience directly on your smartphone:
1. Find your machine's local IP address (e.g., `192.168.1.50`).
2. Add the IP to `subjectAltName` in `generate_ssl_certs.sh` or `.ps1`:
   ```bash
   -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.50"
   ```
3. Regenerate certificates.
4. On your mobile phone browser, open `https://192.168.1.50` and accept the certificate.
5. Camera and microphone will now work on your mobile device!
