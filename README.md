# EduRisk

EduRisk provides **performance-based risk profiling and early-warning** for the Semester III cohort. The web workspace adds an authenticated React UI and a Python API around the existing Isolation Forest model, Supabase tables, and n8n triage workflow.

Risk scores are cohort-relative anomaly percentiles, not calibrated probabilities of future failure. The current dataset does not contain verified future outcomes, student names, attendance, or intervention ownership; the UI does not invent these fields or claim prediction accuracy.

## Run locally

1. Install the Python dependencies from the repository root:

   ```powershell
   python -m pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` if needed, then configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Set `SUPABASE_ANON_KEY` for password sign-in when available. Keep all Supabase keys server-side; never add them to frontend variables.

3. Apply the existing migrations in timestamp order from `supabase/migrations/` and ensure the cohort records are imported. Keep the n8n workflow from `automation/EduRisk-Risk-Triage.json` configured and active separately.

4. Start the API from the repository root:

   ```powershell
   python -m uvicorn backend.main:app --reload --port 8000
   ```

5. In another terminal, install and start the React app:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

   Open the Vite URL, normally `http://localhost:5173`. Vite proxies `/api` requests to port 8000. The API health check is `http://localhost:8000/api/health`.

The existing Streamlit prototype remains available with `python -m streamlit run app.py`.

## Supabase access and roles

Create authorized users in Supabase Auth. Set each user's **app metadata** (not user-editable metadata) to one of these roles:

```json
{"edurisk_role": "admin"}
```

Supported values are `admin`, `faculty`, and `advisor`. For example, an administrator can set the server-controlled claim in the Supabase SQL editor:

```sql
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || '{"edurisk_role":"admin"}'::jsonb
WHERE email = 'admin@example.edu';
```

Use `faculty` or `advisor` for the other roles. The API verifies the access token with Supabase Auth on every protected request and enforces role permissions. The service-role key is used only by the Python server. RLS remains enabled; the server's service key bypasses RLS and must never be sent to the browser.

- Admin: full workspace access, risk-profile runs, and intervention status updates.
- Faculty: dashboard, students, performance analytics, risk profiles, and reports.
- Advisor: dashboard, student/risk review, intervention queue, and reports.

The current schema has no assignment field, so interventions can be marked for follow-up or closed, but not assigned to a staff member. n8n remains the only workflow that creates intervention rows. Student notifications are not sent; high-risk items remain `needs_contact_data` until an approved channel exists.

## API surface

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/dashboard`, `GET /api/students`, `GET /api/students/{student_id}`
- `GET /api/performance`, `GET /api/analytics`
- `GET /api/risk-predictions`, `POST /api/risk-predictions/run`
- `GET /api/interventions`, `PATCH /api/interventions/{source_prediction_id}`
- `GET /api/health`

The React app uses these API routes and does not connect directly to Supabase. Reports export CSV and use the browser print dialog for PDF output.
