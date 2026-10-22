# HireEngine HR — Autonomous AI Recruitment & Interview Engine

HireEngine is an end-to-end recruitment platform featuring automated CV parsing & anonymization, an advisory AI rubric scorer, autonomous AI voice interviews powered by OpenAI Realtime, LiveKit-based video interviews, and an intelligent slot allocation engine.

---

## Tech Stack

- **Backend**: Python 3.12, Django 5, Django REST Framework, SimpleJWT
- **Database**: PostgreSQL 16 with `btree_gist` exclusion constraints
- **Task Queue & Scheduler**: Celery 5 + Redis 7 (Celery Beat for cron tasks)
- **Frontend**: React 18, Vite, React Router 6, TanStack Query, Vanilla CSS design tokens
- **AI / Realtime**: OpenAI Realtime API (WebRTC voice streaming) + GPT-4o rubric scoring
- **Video Conferencing**: LiveKit Cloud / Server (`@livekit/components-react`)
- **Deployment**: Docker & Docker Compose with Nginx SSL reverse-proxy (HTTPS)

---

## 3-Round Hiring Pipeline Architecture

```
[Candidate Application]
        │
        ▼
[Round 1: CV Pipeline]
   ├── Rule-based PII redaction (phones, emails, URLs)
   ├── AI Anonymization (gender, ethnicity, age, names removed)
   ├── Rubric Scoring (0-100: Skills, Experience, Education)
   └── Blind HR Review ("Candidate #n") ──► Send AI Invitations
        │
        ▼
[Round 2: Autonomous AI Voice Interview]
   ├── Ephemeral Realtime WebRTC voice session (<=5 min)
   ├── Advisory transcript scoring against JD requirements
   └── HR Review & Inclusion/Exclusion ──► Send HR Invitations
        │
        ▼
[Round 3: Live Video HR Interview]
   ├── LiveKit WebRTC Video Room with HR Candidate Side Panel
   ├── Candidate CV + AI score view & Resume link
   └── HR Evaluation (1-10 rating, notes, selected/rejected) ──► Send Final Results
```

---

## Quickstart & Local Setup

### 1. Environment Configuration
```bash
cp src/.env.example src/.env
# Edit src/.env with your OPENAI_API_KEY, LIVEKIT credentials, and SMTP settings
```

### 2. Run with Docker Compose
```bash
cd src
docker compose up -d
```

### 3. Run Migrations
```bash
docker compose exec api python manage.py migrate
```

### 4. Seed Demo Data (Phase 7 Seed Script)
Populate the database with a verified HR recruiter account, sample job with availability windows, and 5 candidate profiles:
```bash
# Run inside Docker:
docker compose exec api python manage.py seed_demo --reset

# Or locally with Python:
python seed.py --reset
```

**Seeded HR Credentials:**
- **Email**: `demo@hireengine.dev`
- **Password**: `DemoPassword123!`
- **Public Apply Link**: `http://localhost:5173/apply/full-stack-ai-demo`

---

## Running Over HTTPS (Required for Mobile Mic & Camera)

Modern browsers require HTTPS for `navigator.mediaDevices.getUserMedia()`.

1. Generate self-signed SSL certificates:
   ```powershell
   # Windows
   powershell -ExecutionPolicy Bypass -File .\src\nginx\generate_ssl_certs.ps1

   # Linux / macOS
   chmod +x ./src/nginx/generate_ssl_certs.sh && ./src/nginx/generate_ssl_certs.sh
   ```
2. Start the HTTPS stack:
   ```bash
   cd src
   docker compose -f docker-compose.https.yml up --build -d
   ```
3. Open `https://localhost` in your browser. See [docs/https-deployment.md](docs/https-deployment.md) for details.

---

## Daily 90-Day Retention Cleanup

Per GDPR and SRS privacy specifications:
- Candidate data (applications, resumes, interviews, transcripts, email logs) is automatically purged **90 days** after a job is completed or removed.
- Scheduled daily at **02:00 AM UTC** via Celery Beat (`applications.tasks.cleanup_expired_data`).

---

## Running the Test Suite

Run the full Django test suite across all apps:
```bash
cd src/api
.\.venv\Scripts\python.exe manage.py test accounts.tests
.\.venv\Scripts\python.exe manage.py test jobs.tests
.\.venv\Scripts\python.exe manage.py test applications.tests
.\.venv\Scripts\python.exe manage.py test interviews.tests
.\.venv\Scripts\python.exe manage.py test notifications.tests
```

All 39+ unit and integration tests validate the complete requirement specification.
