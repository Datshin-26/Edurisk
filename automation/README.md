# EduRisk n8n workflow

Import `EduRisk-Risk-Triage.json` into n8n after applying `supabase/migrations/20261002020000_risk_interventions.sql` in Supabase SQL Editor.

## Configure credentials

Create one n8n HTTP Request credential using **Simplified Custom Auth** with this template:

```json
{
  "headers": {
    "apikey": "{{apiKey}}",
    "Authorization": "Bearer {{apiKey}}"
  }
}
```

Set `apiKey` to a rotated Supabase Secret API key or service-role key inside n8n's credential form. Do not put it in workflow fields, this repository, or chat. Select the same credential on every HTTP Request node. If your n8n version doesn't offer Simplified Custom Auth, use Custom Auth and enter the two headers in its credential form.

## Workflow behavior

- Polls Supabase every 15 minutes.
- Chooses the newest prediction per student and model version; older duplicate prediction rows are left untouched.
- Writes each prediction at most once to `risk_interventions`, keyed by `source_prediction_id`.
- Routes High risk to `intervention_pending` with a seven-day follow-up due date; Medium/Low are logged as `monitoring`.
- Marks overdue High follow-ups as `follow_up_due`.
- Leaves High notifications at `needs_contact_data`. The source data has no approved student contact channel, so this workflow does not send email/SMS.

The workflow is imported inactive. Test it manually, confirm the intervention rows, then activate the schedule. Supabase service-role credentials bypass RLS; restrict access to the n8n instance and keep the credential private. The workflow queries up to 1,000 prediction/intervention rows per run; add pagination before using it beyond this MVP cohort.