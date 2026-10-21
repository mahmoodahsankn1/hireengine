---
trigger: model_decision
description: PostgreSQL schema, constraints, enums and the interview clash rule for HireFlow. Use when writing models, migrations, queries, serializers or anything touching the database.
---

# HireFlow HR — Database Rules (PostgreSQL)
UUID PKs, TIMESTAMPTZ (UTC). Needs `btree_gist`. No pgvector/embeddings. Follow exactly; change only with approval.

## users (HR)
id; email UNIQUE; password_hash; full_name; company_name; company_description text; address text; timezone default 'Asia/Kolkata'; is_email_verified bool default false; created_at

## email_otps
id; user_id FK cascade; code_hash; expires_at; attempts smallint default 0; used_at null; created_at

## jobs
id; hr_id FK users; title; description text; required_skills jsonb NOT NULL `[{"skill":"Django","level":"must|nice"}]`; min_experience_years smallint default 0; employment_type (full_time|part_time|internship|contract); location; work_mode (onsite|remote|hybrid); salary_range null; form_slug UNIQUE; application_deadline; ai_shortlist_count int >0; final_shortlist_count int >0 and ≤ ai_shortlist_count; min_cv_score smallint null (0–100); ai_interview_prompt text; ai_duration_minutes default 5 CHECK 1–5; ai_buffer_minutes default 3; ai_join_early_minutes default 5; ai_late_grace_minutes default 2 CHECK ≤ ai_buffer_minutes; hr_duration_minutes default 30; hr_buffer_minutes default 5; hr_join_early_minutes default 5; stage default 'draft'; is_deleted default false; published_at null; created_at; updated_at

## availability_windows
id; job_id FK cascade; round smallint CHECK IN (2,3) (2=AI, 3=HR); start_at; end_at CHECK > start_at

## applications
id; job_id FK; full_name; email; phone; email_normalized (lower/trim); phone_normalized (digits, last 10); resume_file; anonymized_text null; cv_score smallint null 0–100; score_breakdown jsonb null (sub-scores, reason, prompt_version, model); processing_status default 'pending'; processing_attempts smallint default 0; cv_rank int null; pipeline_status default 'applied'; rejected_round smallint null (1|2|3); advance_next bool default false; consent_given bool CHECK = true; consent_at; policy_version; applied_at

## interviews
id; job_id FK; application_id FK; hr_id FK users; kind CHECK IN ('ai','hr'); start_at; duration_minutes; reserved_until (= start_at + duration + buffer); join_opens_at (= start_at − join_early); join_closes_at (AI: start_at + late_grace; HR: start_at + duration); access_token UNIQUE (random ≥32 bytes); room_name null (LiveKit, HR only); status default 'scheduled'; started_at null; ended_at null; created_at

## ai_results
id; interview_id FK UNIQUE; transcript jsonb null (turns: speaker, text, time); score smallint null 0–100; score_breakdown jsonb null; scoring_status default 'pending'; model_name; prompt_version; scored_at null

## feedback (HR interview)
id; interview_id FK UNIQUE; rating smallint null 1–10; notes text null; decision (selected|rejected) NOT NULL; submitted_at

## job_rounds
id; job_id FK cascade; round CHECK IN (1,2,3); completed_at null; hr_notified_at null; emails_sent_at null (non-null = send button already used; refuse second press). UNIQUE(job_id, round)

## email_logs
id; recipient; kind; job_id FK null; application_id FK null; status default 'queued'; attempts smallint default 0; error text null; created_at; sent_at null

## Enums
- jobs.stage: draft, collecting, cv_review, ai_interview, ai_review, hr_interview, hr_review, completed
- applications.processing_status: pending, done, failed (UI: "needs attention")
- applications.pipeline_status: applied, ai_invited, hr_invited, selected, rejected
- interviews.status: scheduled, in_progress, completed, incomplete, no_show, cancelled
- email_logs.kind: otp, application_received, round_finished_hr, ai_invite, ai_regret, hr_invite, hr_regret, final_selected, final_rejected
- email_logs.status: queued, sent, failed

## Constraints & indexes
- UNIQUE applications(job_id, email_normalized); UNIQUE applications(job_id, phone_normalized) → duplicate protection.
- UNIQUE interviews(application_id, kind); UNIQUE interviews(access_token).
- UNIQUE email_logs(application_id, kind) WHERE application_id IS NOT NULL.
- Clash rule (one AI interview at a time per HR; no overlapping HR interviews):
```sql
ALTER TABLE interviews ADD CONSTRAINT interviews_no_overlap
EXCLUDE USING gist (hr_id WITH =, kind WITH =, tstzrange(start_at, reserved_until) WITH &&)
WHERE (status <> 'cancelled');
```
- Indexes: jobs(hr_id,is_deleted); applications(job_id,cv_score DESC); applications(job_id,pipeline_status); interviews(job_id,kind,status); interviews(start_at); availability_windows(job_id,round).

## Relationships
users 1:N jobs · jobs 1:N availability_windows/applications/job_rounds · application 1:0..1 interview per kind · ai interview 1:1 ai_results · hr interview 1:1 feedback · jobs/applications 1:N email_logs.