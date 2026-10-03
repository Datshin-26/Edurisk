# EduRisk

EduRisk is an early-warning workspace for reviewing academic performance and prioritizing student support. It combines a React dashboard, a FastAPI service, Supabase Auth and Postgres, an Isolation Forest risk profile, and an optional n8n intervention workflow.

Risk scores are cohort-relative anomaly percentiles, not calibrated probabilities of future failure. The current data does not include verified future outcomes, student names, or approved student contact channels.

## Screenshots

The `outcome/` folder contains UI captures. The settings capture containing an account email is intentionally kept out of the public repository.

![EduRisk sign-in](outcome/Screenshot%202026-10-03%20211159.png)

![EduRisk dashboard](outcome/Screenshot%202026-10-03%20211229.png)

![EduRisk report preview](outcome/Screenshot%202026-10-03%20211249.png)

![EduRisk intervention queue](outcome/Screenshot%202026-10-03%20211349.png)

## Features

- Role-protected dashboard, student review, performance analytics, risk profiles, reports, and intervention queue.
- Supabase Auth password login with server-side role checks on protected API requests.
- CSV report export and browser print-to-PDF.
- Optional n8n workflow for idempotent intervention tracking and follow-up updates.
- Streamlit prototype available with `python -m streamlit run app.py`.

## Requirements

- Python 3.11 or newer
- Node.js compatible with Vite 7
- A Supabase project with the EduRisk migrations applied

## Local setup

1. Install Python dependencies from the repository root:

   ```powershell
   python -m pip install -r requirements.txt
   ```

2. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

   Set `SUPABASE_URL` to the project root URL, such as `https://<project-ref>.supabase.co`. Do not append `/rest/v1`; the Python client adds that path. Set `SUPABASE_SERVICE_ROLE_KEY` to a server-only service-role or secret API key. Set `SUPABASE_ANON_KEY` to the project's anon or publishable key. Never commit `.env` or put server credentials in frontend variables.

3. Apply every SQL migration in `supabase/migrations/` in timestamp order. Import the cohort records into Supabase before using analytics. Input files are in `data/`.

4. Start the API from the repository root:

   ```powershell
   python -m uvicorn backend.main:app --reload --port 8000
   ```

5. In a second terminal, start the web app:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

   Open the Vite URL shown in the terminal, normally `http://localhost:5173`. Vite proxies `/api` requests to port 8000. Check the API at `http://localhost:8000/api/health`.

## Authentication and roles

Create a user in Supabase under **Authentication > Users**. No extra database table is needed for login. Assign the user's server-controlled app metadata role in Supabase SQL Editor. Replace the sample email with the account email:

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || '{"edurisk_role":"admin"}'::jsonb
WHERE email = 'admin@example.edu';
```

Supported roles:

- `admin`: full workspace access, profile runs, and intervention status updates.
- `faculty`: dashboard, students, analytics, risk profiles, and reports.
- `advisor`: dashboard, student and risk review, interventions, and reports.

Keep the service credential on the API server. The browser receives only a verified access token. Supabase Row Level Security remains enabled; the server credential bypasses RLS and must be protected.

## Data and risk interpretation

The current cohort contains 49 anonymized Semester III records. If the live performance table lacks `semester` or `academic_year`, the API treats its rows as the configured Semester III 2026 cohort. In that case, ensure the table contains only the intended cohort.

Risk levels rank students relative to the loaded cohort. There is no validated future-outcome target, so scores should guide human review, not be interpreted as failure probabilities. Student notifications are not sent because approved contact data is unavailable. Intervention ownership is not supported by the current schema.

## n8n workflow

The workflow definition is `automation/EduRisk-Risk-Triage.json`; setup and credential instructions are in [automation/README.md](automation/README.md). Import and test it separately after applying the intervention migration. It is inactive on import and must be reviewed before activation.

## API routes

- `POST /api/auth/login` and `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/students` and `GET /api/students/{student_id}`
- `GET /api/performance` and `GET /api/analytics`
- `GET /api/risk-predictions` and `POST /api/risk-predictions/run`
- `GET /api/interventions` and `PATCH /api/interventions/{source_prediction_id}`
- `GET /api/health`

The React app communicates with the Python API; it does not connect directly to Supabase.
