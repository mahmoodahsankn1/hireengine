import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import Navbar from '../components/Navbar'

const STAGE_LABELS = {
  draft: 'Draft', collecting: 'Collecting Applications',
  cv_review: 'CV Review', ai_interview: 'AI Interview',
  ai_review: 'AI Review', hr_interview: 'HR Interview',
  hr_review: 'HR Review', completed: 'Completed'
}
const STAGE_BADGE = {
  draft: 'badge-muted', collecting: 'badge-accent', cv_review: 'badge-primary',
  ai_interview: 'badge-warning', ai_review: 'badge-warning',
  hr_interview: 'badge-primary', hr_review: 'badge-primary', completed: 'badge-success'
}

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')

  const { data: job, isLoading, error, refetch } = useQuery({
    queryKey: ['job-detail', id],
    queryFn: () => api.get(`/jobs/${id}/`).then(r => r.data),
  })

  async function handlePublish() {
    if (!confirm('Publish this job? The application link will go live.')) return
    try {
      await api.post(`/jobs/${id}/publish/`)
      refetch()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to publish.')
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/apply/${job.form_slug}`
    await navigator.clipboard.writeText(url)
    alert('Application link copied to clipboard!')
  }

  if (isLoading) return (
    <>
      <Navbar />
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: '2rem', height: '2rem' }} />
      </div>
    </>
  )

  if (error || !job) return (
    <>
      <Navbar />
      <div className="page">
        <div className="alert alert-error">Could not load job. <Link to="/dashboard">← Back</Link></div>
      </div>
    </>
  )

  return (
    <>
      <Navbar />
      <div className="page">
        {/* Header */}
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <Link to="/dashboard" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>← Dashboard</Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 className="page-title">{job.title}</h1>
              <span className={`badge ${STAGE_BADGE[job.stage] || 'badge-muted'}`} style={{ fontSize: '0.8rem' }}>
                {STAGE_LABELS[job.stage] || job.stage}
              </span>
            </div>
            <p className="page-subtitle">{job.location} · {job.employment_type?.replace('_', ' ')} · {job.work_mode}</p>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            {job.stage === 'draft' && (
              <button id="publish-btn" className="btn btn-primary" onClick={handlePublish}>🚀 Publish</button>
            )}
            {job.stage !== 'draft' && job.form_slug && (
              <button id="copy-link-btn" className="btn btn-secondary" onClick={copyLink}>📋 Copy Apply Link</button>
            )}
            <Link id="edit-btn" to={`/jobs/${id}/edit`} className="btn btn-secondary">✏️ Edit</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'round1',   label: 'Round 1 · CV' },
            { key: 'round2',   label: 'Round 2 · AI' },
            { key: 'round3',   label: 'Round 3 · HR' },
          ].map(t => (
            <button key={t.key} id={`tab-${t.key}`}
              className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Job Details</h3>
              <dl style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {[
                  ['Deadline', formatDate(job.application_deadline)],
                  ['Published', formatDate(job.published_at)],
                  ['AI Shortlist', job.ai_shortlist_count],
                  ['Final Shortlist', job.final_shortlist_count],
                  ['Min CV Score', job.min_cv_score ?? 'None'],
                  ['Salary', job.salary_range || '—'],
                  ['Min Experience', `${job.min_experience_years} yr(s)`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
                    <dd style={{ fontWeight: 500 }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Required Skills</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {(job.required_skills || []).map((sk, i) => (
                  <span key={i} className={`badge ${sk.level === 'must' ? 'badge-danger' : 'badge-muted'}`}>
                    {sk.skill} · {sk.level}
                  </span>
                ))}
              </div>

              <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Capacity</h3>
              <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                <span className={`capacity-badge ${job.ai_capacity >= job.ai_shortlist_count ? 'capacity-ok' : 'capacity-error'}`}>
                  AI: {job.ai_capacity ?? 0} / {job.ai_shortlist_count} slots
                </span>
                <span className={`capacity-badge ${job.hr_capacity >= job.final_shortlist_count ? 'capacity-ok' : 'capacity-error'}`}>
                  HR: {job.hr_capacity ?? 0} / {job.final_shortlist_count} slots
                </span>
              </div>
            </div>

            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <h3 style={{ marginBottom: '1rem' }}>Job Description</h3>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.7 }}>{job.description}</p>
            </div>
          </div>
        )}

        {/* Round 1 Tab */}
        {activeTab === 'round1' && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</p>
            <h3 style={{ marginBottom: '0.5rem' }}>Round 1 — CV Review</h3>
            <p style={{ maxWidth: 480, margin: '0 auto' }}>
              CV pipeline and blind candidate review will be available here once the application
              deadline passes and CVs are processed (Phase 3).
            </p>
            <div style={{ marginTop: '1.5rem' }}>
              <span className="badge badge-muted">Applications: {job.applications_count ?? 0}</span>
            </div>
          </div>
        )}

        {/* Round 2 Tab */}
        {activeTab === 'round2' && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤖</p>
            <h3 style={{ marginBottom: '0.5rem' }}>Round 2 — AI Interviews</h3>
            <p style={{ maxWidth: 480, margin: '0 auto' }}>
              AI interview scores, transcripts, and include/exclude controls will appear here
              after invitations are sent (Phase 5).
            </p>
          </div>
        )}

        {/* Round 3 Tab */}
        {activeTab === 'round3' && (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎥</p>
            <h3 style={{ marginBottom: '0.5rem' }}>Round 3 — HR Interviews</h3>
            <p style={{ maxWidth: 480, margin: '0 auto' }}>
              Live video interview rooms, ratings, notes, and final decisions will appear here
              (Phase 6).
            </p>
          </div>
        )}
      </div>
    </>
  )
}
