import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import Navbar from '../components/Navbar'

const SKILL_LEVELS = ['must', 'nice']
const EMPLOYMENT_TYPES = [
  { value: 'full_time',   label: 'Full Time' },
  { value: 'part_time',   label: 'Part Time' },
  { value: 'internship',  label: 'Internship' },
  { value: 'contract',    label: 'Contract' },
]
const WORK_MODES = [
  { value: 'onsite', label: 'Onsite' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
]

const defaultForm = {
  title: '', description: '', min_experience_years: 0,
  employment_type: 'full_time', location: '', work_mode: 'onsite',
  salary_range: '', application_deadline: '',
  ai_shortlist_count: 5, final_shortlist_count: 3, min_cv_score: '',
  ai_interview_prompt: '',
  ai_duration_minutes: 5, ai_buffer_minutes: 3,
  ai_join_early_minutes: 5, ai_late_grace_minutes: 2,
  hr_duration_minutes: 30, hr_buffer_minutes: 5, hr_join_early_minutes: 5,
}

function localDatetimeValue(dt) {
  if (!dt) return ''
  return new Date(dt).toISOString().slice(0, 16)
}

function CapacityBadge({ count, required, label }) {
  if (count === null || count === undefined) return null
  const ok = count >= required
  return (
    <span className={`capacity-badge ${ok ? 'capacity-ok' : 'capacity-error'}`}>
      {ok ? '✓' : '⚠'} {label}: {count} slots (need {required})
    </span>
  )
}

export default function JobForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(defaultForm)
  const [skills, setSkills] = useState([{ skill: '', level: 'must' }])
  const [aiWindows, setAiWindows] = useState([])
  const [hrWindows, setHrWindows] = useState([])
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [capacity, setCapacity] = useState({ ai: null, hr: null })

  // Load job when editing
  const { data: jobData } = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.get(`/jobs/${id}/`).then(r => r.data),
    enabled: isEdit,
  })

  useEffect(() => {
    if (!jobData) return
    setForm({
      title: jobData.title || '',
      description: jobData.description || '',
      min_experience_years: jobData.min_experience_years ?? 0,
      employment_type: jobData.employment_type || 'full_time',
      location: jobData.location || '',
      work_mode: jobData.work_mode || 'onsite',
      salary_range: jobData.salary_range || '',
      application_deadline: localDatetimeValue(jobData.application_deadline),
      ai_shortlist_count: jobData.ai_shortlist_count ?? 5,
      final_shortlist_count: jobData.final_shortlist_count ?? 3,
      min_cv_score: jobData.min_cv_score ?? '',
      ai_interview_prompt: jobData.ai_interview_prompt || '',
      ai_duration_minutes: jobData.ai_duration_minutes ?? 5,
      ai_buffer_minutes: jobData.ai_buffer_minutes ?? 3,
      ai_join_early_minutes: jobData.ai_join_early_minutes ?? 5,
      ai_late_grace_minutes: jobData.ai_late_grace_minutes ?? 2,
      hr_duration_minutes: jobData.hr_duration_minutes ?? 30,
      hr_buffer_minutes: jobData.hr_buffer_minutes ?? 5,
      hr_join_early_minutes: jobData.hr_join_early_minutes ?? 5,
    })

    if (jobData.required_skills?.length) {
      setSkills(jobData.required_skills)
    }

    const wins = jobData.availability_windows || []
    setAiWindows(wins.filter(w => w.round === 2).map(w => ({
      start_at: localDatetimeValue(w.start_at),
      end_at: localDatetimeValue(w.end_at),
    })))
    setHrWindows(wins.filter(w => w.round === 3).map(w => ({
      start_at: localDatetimeValue(w.start_at),
      end_at: localDatetimeValue(w.end_at),
    })))

    setCapacity({ ai: jobData.ai_capacity ?? null, hr: jobData.hr_capacity ?? null })
  }, [jobData])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    setErrors(er => ({ ...er, [name]: '' }))
    setServerError('')
  }

  // Skill management
  function addSkill() { setSkills(s => [...s, { skill: '', level: 'must' }]) }
  function removeSkill(i) { setSkills(s => s.filter((_, idx) => idx !== i)) }
  function updateSkill(i, field, val) {
    setSkills(s => s.map((sk, idx) => idx === i ? { ...sk, [field]: val } : sk))
  }

  // Window management
  function addWindow(setter) {
    setter(ws => [...ws, { start_at: '', end_at: '' }])
  }
  function removeWindow(setter, i) {
    setter(ws => ws.filter((_, idx) => idx !== i))
  }
  function updateWindow(setter, i, field, val) {
    setter(ws => ws.map((w, idx) => idx === i ? { ...w, [field]: val } : w))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setServerError('')
    setErrors({})

    const validSkills = skills.filter(s => s.skill.trim())
    if (!validSkills.length) {
      setErrors({ required_skills: 'Add at least one required skill.' })
      setLoading(false)
      return
    }

    const windows = [
      ...aiWindows.filter(w => w.start_at && w.end_at).map(w => ({
        round: 2,
        start_at: new Date(w.start_at).toISOString(),
        end_at: new Date(w.end_at).toISOString(),
      })),
      ...hrWindows.filter(w => w.start_at && w.end_at).map(w => ({
        round: 3,
        start_at: new Date(w.start_at).toISOString(),
        end_at: new Date(w.end_at).toISOString(),
      })),
    ]

    const payload = {
      ...form,
      application_deadline: form.application_deadline
        ? new Date(form.application_deadline).toISOString()
        : '',
      min_cv_score: form.min_cv_score === '' ? null : parseInt(form.min_cv_score),
      required_skills: validSkills,
      availability_windows: windows,
    }

    try {
      let res
      if (isEdit) {
        res = await api.patch(`/jobs/${id}/`, payload)
      } else {
        res = await api.post('/jobs/', payload)
      }
      setCapacity({ ai: res.data.ai_capacity, hr: res.data.hr_capacity })
      navigate('/dashboard')
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        const fieldErrors = {}
        for (const [key, val] of Object.entries(data)) {
          fieldErrors[key] = Array.isArray(val) ? val[0] : (typeof val === 'string' ? val : JSON.stringify(val))
        }
        setErrors(fieldErrors)
        setServerError('Please fix the errors below.')
      } else {
        setServerError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const hasApplications = Boolean(isEdit && jobData?.applications_count > 0)

  return (
    <>
      <Navbar />
      <div className="page" style={{ maxWidth: 860 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">{isEdit ? 'Edit Job' : 'Post a New Job'}</h1>
            <p className="page-subtitle">
              {isEdit ? `Editing: ${jobData?.title || '…'}` : 'Fill in the details to create a job posting'}
            </p>
          </div>
        </div>

        {serverError && (
          <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>{serverError}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* ── Basic Info ── */}
          <div className="card">
            <div className="form-section-title">Basic Information</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Job Title *</label>
                <input id="job-title" name="title" type="text" className={`form-input ${errors.title ? 'error' : ''}`}
                  placeholder="e.g. Senior Backend Engineer" value={form.title} onChange={handleChange} required />
                {errors.title && <span className="form-error">{errors.title}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Job Description *</label>
                <textarea id="job-desc" name="description" className={`form-textarea ${errors.description ? 'error' : ''}`}
                  placeholder="Describe the role, responsibilities, and what makes it exciting…"
                  value={form.description} onChange={handleChange} required rows={5}
                  disabled={hasApplications} />
                {hasApplications && <span className="form-hint">⚠ Description locked after first application</span>}
                {errors.description && <span className="form-error">{errors.description}</span>}
              </div>

              <div className="job-form-grid">
                <div className="form-group">
                  <label className="form-label">Employment Type *</label>
                  <select id="job-emp-type" name="employment_type" className="form-select"
                    value={form.employment_type} onChange={handleChange}>
                    {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Work Mode *</label>
                  <select id="job-work-mode" name="work_mode" className="form-select"
                    value={form.work_mode} onChange={handleChange}>
                    {WORK_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="job-form-grid">
                <div className="form-group">
                  <label className="form-label">Location *</label>
                  <input id="job-location" name="location" type="text" className={`form-input ${errors.location ? 'error' : ''}`}
                    placeholder="e.g. Bangalore, India" value={form.location} onChange={handleChange} required />
                  {errors.location && <span className="form-error">{errors.location}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Min. Experience (years)</label>
                  <input id="job-exp" name="min_experience_years" type="number" min="0" className="form-input"
                    value={form.min_experience_years} onChange={handleChange} />
                </div>
              </div>

              <div className="job-form-grid">
                <div className="form-group">
                  <label className="form-label">Salary Range</label>
                  <input id="job-salary" name="salary_range" type="text" className="form-input"
                    placeholder="e.g. ₹12–18 LPA" value={form.salary_range} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Application Deadline *</label>
                  <input id="job-deadline" name="application_deadline" type="datetime-local"
                    className={`form-input ${errors.application_deadline ? 'error' : ''}`}
                    value={form.application_deadline} onChange={handleChange} required />
                  {errors.application_deadline && <span className="form-error">{errors.application_deadline}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* ── Required Skills ── */}
          <div className="card">
            <div className="form-section-title">Required Skills</div>
            {hasApplications && (
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                Skills are locked after the first application is received.
              </div>
            )}
            <div className="skills-list">
              {skills.map((sk, i) => (
                <div key={i} className="skill-row">
                  <input id={`skill-name-${i}`} type="text" className={`form-input ${errors.required_skills ? 'error' : ''}`}
                    placeholder="e.g. Python" value={sk.skill}
                    onChange={e => updateSkill(i, 'skill', e.target.value)}
                    disabled={hasApplications} />
                  <select id={`skill-level-${i}`} className="form-select" style={{ maxWidth: 110 }}
                    value={sk.level} onChange={e => updateSkill(i, 'level', e.target.value)}
                    disabled={hasApplications}>
                    <option value="must">Must</option>
                    <option value="nice">Nice</option>
                  </select>
                  {!hasApplications && (
                    <button type="button" className="btn btn-ghost" onClick={() => removeSkill(i)}
                      disabled={skills.length === 1}>✕</button>
                  )}
                </div>
              ))}
            </div>
            {errors.required_skills && <p className="form-error" style={{ marginTop: '0.5rem' }}>{errors.required_skills}</p>}
            {!hasApplications && (
              <button id="add-skill" type="button" className="btn btn-secondary"
                style={{ marginTop: '0.75rem', fontSize: '0.82rem' }} onClick={addSkill}>
                + Add Skill
              </button>
            )}
          </div>

          {/* ── Shortlist & Scoring ── */}
          <div className="card">
            <div className="form-section-title">Shortlist & Scoring</div>
            <div className="job-form-grid">
              <div className="form-group">
                <label className="form-label">AI Shortlist Count *</label>
                <input id="job-ai-count" name="ai_shortlist_count" type="number" min="1" className="form-input"
                  value={form.ai_shortlist_count} onChange={handleChange} required />
                <span className="form-hint">Candidates to invite for AI interview</span>
              </div>
              <div className="form-group">
                <label className="form-label">Final Shortlist Count *</label>
                <input id="job-final-count" name="final_shortlist_count" type="number" min="1" className="form-input"
                  value={form.final_shortlist_count} onChange={handleChange} required />
                <span className="form-hint">Must be ≤ AI shortlist count</span>
              </div>
            </div>
            <div className="job-form-grid" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Min CV Score (0–100)</label>
                <input id="job-min-score" name="min_cv_score" type="number" min="0" max="100" className="form-input"
                  placeholder="Optional" value={form.min_cv_score} onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* ── AI Interview Settings ── */}
          <div className="card">
            <div className="form-section-title">AI Interview Settings</div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Custom Interview Prompt</label>
              <textarea id="job-ai-prompt" name="ai_interview_prompt" className="form-textarea"
                placeholder="Specific topics or questions for the AI interviewer (e.g. focus on system design, ask about past projects)…"
                value={form.ai_interview_prompt} onChange={handleChange} rows={3} />
            </div>
            <div className="job-form-grid">
              <div className="form-group">
                <label className="form-label">Duration (1–5 min) *</label>
                <input id="job-ai-dur" name="ai_duration_minutes" type="number" min="1" max="5" className="form-input"
                  value={form.ai_duration_minutes} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Buffer (min)</label>
                <input id="job-ai-buf" name="ai_buffer_minutes" type="number" min="1" className="form-input"
                  value={form.ai_buffer_minutes} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Join Early (min)</label>
                <input id="job-ai-join-early" name="ai_join_early_minutes" type="number" min="1" className="form-input"
                  value={form.ai_join_early_minutes} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Late Grace (min) *</label>
                <input id="job-ai-late" name="ai_late_grace_minutes" type="number" min="0" className="form-input"
                  value={form.ai_late_grace_minutes} onChange={handleChange} />
                <span className="form-hint">Must be ≤ buffer minutes</span>
                {errors.ai_late_grace_minutes && <span className="form-error">{errors.ai_late_grace_minutes}</span>}
              </div>
            </div>
          </div>

          {/* ── HR Interview Settings ── */}
          <div className="card">
            <div className="form-section-title">HR Interview Settings</div>
            <div className="job-form-grid">
              <div className="form-group">
                <label className="form-label">Duration (min)</label>
                <input id="job-hr-dur" name="hr_duration_minutes" type="number" min="10" className="form-input"
                  value={form.hr_duration_minutes} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Buffer (min)</label>
                <input id="job-hr-buf" name="hr_buffer_minutes" type="number" min="1" className="form-input"
                  value={form.hr_buffer_minutes} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Join Early (min)</label>
                <input id="job-hr-join-early" name="hr_join_early_minutes" type="number" min="1" className="form-input"
                  value={form.hr_join_early_minutes} onChange={handleChange} />
              </div>
            </div>
          </div>

          {/* ── Availability Windows ── */}
          <div className="card">
            <div className="form-section-title">Availability Windows</div>
            <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              All windows must start after the application deadline. HR windows must be after AI windows.
            </p>
            {errors.availability_windows && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{errors.availability_windows}</div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Round 2 — AI Interview Windows</h3>
                {capacity.ai !== null && (
                  <CapacityBadge count={capacity.ai} required={parseInt(form.ai_shortlist_count) || 0} label="AI" />
                )}
              </div>
              <div className="windows-list">
                {aiWindows.map((w, i) => (
                  <div key={i} className="window-row">
                    <input id={`ai-win-start-${i}`} type="datetime-local" className="form-input"
                      value={w.start_at} onChange={e => updateWindow(setAiWindows, i, 'start_at', e.target.value)} />
                    <input id={`ai-win-end-${i}`} type="datetime-local" className="form-input"
                      value={w.end_at} onChange={e => updateWindow(setAiWindows, i, 'end_at', e.target.value)} />
                    <button type="button" className="btn btn-ghost" onClick={() => removeWindow(setAiWindows, i)}>✕</button>
                  </div>
                ))}
              </div>
              <button id="add-ai-window" type="button" className="btn btn-secondary"
                style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}
                onClick={() => addWindow(setAiWindows)}>
                + Add AI Window
              </button>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Round 3 — HR Interview Windows</h3>
                {capacity.hr !== null && (
                  <CapacityBadge count={capacity.hr} required={parseInt(form.final_shortlist_count) || 0} label="HR" />
                )}
              </div>
              <div className="windows-list">
                {hrWindows.map((w, i) => (
                  <div key={i} className="window-row">
                    <input id={`hr-win-start-${i}`} type="datetime-local" className="form-input"
                      value={w.start_at} onChange={e => updateWindow(setHrWindows, i, 'start_at', e.target.value)} />
                    <input id={`hr-win-end-${i}`} type="datetime-local" className="form-input"
                      value={w.end_at} onChange={e => updateWindow(setHrWindows, i, 'end_at', e.target.value)} />
                    <button type="button" className="btn btn-ghost" onClick={() => removeWindow(setHrWindows, i)}>✕</button>
                  </div>
                ))}
              </div>
              <button id="add-hr-window" type="button" className="btn btn-secondary"
                style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}
                onClick={() => addWindow(setHrWindows)}>
                + Add HR Window
              </button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '1rem', paddingBottom: '2rem' }}>
            <button id="job-save" type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? <><span className="spinner" /> Saving…</> : (isEdit ? 'Save Changes' : 'Create Job')}
            </button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
