import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { 
  FileText, CheckCircle, AlertTriangle, RefreshCw, Eye, 
  X, Sparkles, Award, Shield, User, ArrowRight,
  Send, CheckSquare, Square, Clock, Users, Mail, AlertCircle,
  MessageSquare, Volume2, Video, ExternalLink, ArrowLeft,
  MapPin, CalendarDays, Building2, ClipboardList, Settings, UsersRound
} from 'lucide-react'
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

function getTranscriptTurns(transcript) {
  if (Array.isArray(transcript)) return transcript
  return Array.isArray(transcript?.turns) ? transcript.turns : []
}

function formatDuration(seconds) {
  const duration = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(duration / 60)
  const remainder = duration % 60
  return `${minutes}m ${remainder}s`
}

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [selectedTranscriptApp, setSelectedTranscriptApp] = useState(null)
  const [round2Filter, setRound2Filter] = useState('all')
  const [retryingId, setRetryingId] = useState(null)

  // Phase 4 Send & Advance States
  const [advancingAppId, setAdvancingAppId] = useState(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendPreviewData, setSendPreviewData] = useState(null)
  const [loadingSendPreview, setLoadingSendPreview] = useState(false)
  const [sendingInvites, setSendingInvites] = useState(false)
  const [sendRegret, setSendRegret] = useState(true)

  const { data: job, isLoading, error, refetch } = useQuery({
    queryKey: ['job-detail', id],
    queryFn: () => api.get(`/jobs/${id}/`).then(r => r.data),
  })

  // Applications Query (enabled across round tabs)
  const { 
    data: applications = [], 
    isLoading: loadingApps, 
    refetch: refetchApps 
  } = useQuery({
    queryKey: ['job-applications', id],
    queryFn: () => api.get(`/applications/?job=${id}`).then(r => r.data),
    enabled: activeTab === 'round1' || activeTab === 'round2' || activeTab === 'round3',
    refetchInterval: (query) => {
      const data = query.state.data
      if (Array.isArray(data) && data.some(a => a.processing_status === 'pending')) {
        return 3000 // Poll every 3 seconds while tasks are processing
      }
      return false
    },
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

  async function handleRetry(appId) {
    setRetryingId(appId)
    try {
      await api.post(`/applications/${appId}/retry/`)
      refetchApps()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to queue re-evaluation.')
    } finally {
      setRetryingId(null)
    }
  }

  // Phase 4: Toggle candidate advance inclusion
  async function handleToggleAdvance(app) {
    setAdvancingAppId(app.id)
    try {
      await api.patch(`/applications/${app.id}/advance/`, {
        advance_next: !app.advance_next
      })
      refetchApps()
      refetch()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update candidate inclusion.')
    } finally {
      setAdvancingAppId(null)
    }
  }

  // Phase 4: Open Send Preview Modal
  async function openSendModal() {
    setLoadingSendPreview(true)
    setShowSendModal(true)
    try {
      const res = await api.get(`/jobs/${id}/send/`)
      setSendPreviewData(res.data)
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load invitation preview.')
      setShowSendModal(false)
    } finally {
      setLoadingSendPreview(false)
    }
  }

  // Phase 4: Confirm Send Action
  async function handleConfirmSend() {
    setSendingInvites(true)
    try {
      const res = await api.post(`/jobs/${id}/send/`, {
        send_regret: sendRegret
      })
      alert(res.data.message || 'Invitations successfully sent!')
      setShowSendModal(false)
      refetch()
      refetchApps()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send invitations.')
    } finally {
      setSendingInvites(false)
    }
  }

  if (isLoading) return (
    <>
      <Navbar className="dashboard-navbar" />
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: '2rem', height: '2rem' }} />
      </div>
    </>
  )

  if (error || !job) return (
    <>
      <Navbar className="dashboard-navbar" />
      <div className="page">
        <div className="alert alert-error">Could not load job. <Link to="/dashboard">← Back</Link></div>
      </div>
    </>
  )

  // Filtered applications
  const filteredApps = applications.filter(app => {
    if (filterStatus === 'all') return true
    if (filterStatus === 'done') return app.processing_status === 'done'
    if (filterStatus === 'failed') return app.processing_status === 'failed'
    if (filterStatus === 'pending') return app.processing_status === 'pending'
    return true
  })

  const totalCount = applications.length
  const doneCount = applications.filter(a => a.processing_status === 'done').length
  const failedCount = applications.filter(a => a.processing_status === 'failed').length
  const pendingCount = applications.filter(a => a.processing_status === 'pending').length
  const advancingCount = applications.filter(a => a.advance_next).length

  // Candidates for Round 2 and Round 3
  const round2Apps = applications.filter(a => !!a.ai_interview || a.pipeline_status === 'ai_invited' || a.pipeline_status === 'hr_invited' || a.pipeline_status === 'selected')
  const round3Apps = applications.filter(a => !!a.hr_interview || a.pipeline_status === 'hr_invited' || a.pipeline_status === 'selected')

  const filteredRound2Apps = round2Apps.filter(app => {
    const intv = app.ai_interview
    if (round2Filter === 'all') return true
    if (round2Filter === 'completed') return intv?.status === 'completed'
    if (round2Filter === 'in_progress') return intv?.status === 'in_progress' || intv?.status === 'scheduled'
    if (round2Filter === 'no_show') return intv?.status === 'no_show' || intv?.status === 'incomplete'
    if (round2Filter === 'advancing') return app.advance_next
    return true
  })

  return (
    <>
      <Navbar className="dashboard-navbar" />
      <main className="job-detail-page">
        <div className="job-detail-heading">
          <div className="job-detail-heading-main">
            <Link to="/dashboard" className="job-detail-back"><ArrowLeft size={15} aria-hidden="true" /> Back to Dashboard</Link>
            <div className="job-detail-title-row">
              <h1 className="job-detail-title">{job.title}</h1>
              <span className={`job-detail-stage badge ${STAGE_BADGE[job.stage] || 'badge-muted'}`}>
                {STAGE_LABELS[job.stage] || job.stage}
              </span>
            </div>
            <div className="job-detail-meta">
              <span><MapPin size={15} aria-hidden="true" /> {job.location || 'Location not specified'}</span>
              <i>·</i>
              <span><CalendarDays size={15} aria-hidden="true" /> {job.employment_type?.replaceAll('_', ' ') || 'Employment type not specified'}</span>
              <i>·</i>
              <span><Building2 size={15} aria-hidden="true" /> {job.work_mode || 'Work mode not specified'}</span>
            </div>
          </div>

          <div className="job-detail-actions">
            {job.stage === 'draft' && (
              <button id="publish-btn" className="btn btn-primary" onClick={handlePublish}>Publish</button>
            )}
            {job.stage !== 'draft' && job.form_slug && (
              <button id="copy-link-btn" className="btn btn-secondary job-copy-action" onClick={copyLink}><ClipboardList size={16} aria-hidden="true" /> Copy Apply Link</button>
            )}
            {['cv_review', 'ai_review', 'hr_review'].includes(job.stage) && (
              <button
                id="header-send-btn"
                className="btn btn-primary job-send-action"
                onClick={openSendModal}
              >
                <Send size={15} /> Send Invitations
              </button>
            )}
            <Link id="edit-btn" to={`/jobs/${id}/edit`} className="btn btn-secondary job-edit-action">Edit</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs job-detail-tabs">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'round1',   label: `Round 1 · CV (${totalCount || job.applications_count || 0})` },
            { key: 'round2',   label: `Round 2 · AI (${round2Apps.length})` },
            { key: 'round3',   label: `Round 3 · HR (${round3Apps.length})` },
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
          <div className="job-overview-grid">
            <section className="card job-overview-card">
              <h3 className="job-overview-card-title"><span><FileText size={16} aria-hidden="true" /></span>Job Details</h3>
              <dl className="job-details-list">
                {[
                  ['Deadline', formatDate(job.application_deadline)],
                  ['Published', formatDate(job.published_at)],
                  ['AI Shortlist', job.ai_shortlist_count],
                  ['Final Shortlist', job.final_shortlist_count],
                  ['Min CV Score', job.min_cv_score ?? 'None'],
                  ['Salary', job.salary_range || '—'],
                  ['Min Experience', `${job.min_experience_years} yr(s)`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="card job-overview-card job-skills-card">
              <h3 className="job-overview-card-title"><span><Settings size={16} aria-hidden="true" /></span>Required Skills</h3>
              <div className="job-skill-list">
                {(job.required_skills || []).map((sk, i) => (
                  <span key={i} className={`job-skill-tag ${sk.level === 'must' ? 'skill-must' : 'skill-nice'}`}>
                    {sk.skill} · {sk.level}
                  </span>
                ))}
              </div>

              <div className="job-capacity-section">
                <h3 className="job-overview-card-title"><span><UsersRound size={16} aria-hidden="true" /></span>Capacity & Allocation</h3>
                <div className="job-capacity-list">
                  <span className={`capacity-badge ${job.ai_capacity >= job.ai_shortlist_count ? 'capacity-ok' : 'capacity-error'}`}>
                  AI: {job.ai_capacity ?? 0} / {job.ai_shortlist_count} slots
                  </span>
                  <span className={`capacity-badge ${job.hr_capacity >= job.final_shortlist_count ? 'capacity-ok' : 'capacity-error'}`}>
                  HR: {job.hr_capacity ?? 0} / {job.final_shortlist_count} slots
                  </span>
                </div>
              </div>
            </section>

            <section className="card job-overview-card job-description-card">
              <h3 className="job-overview-card-title"><span><FileText size={16} aria-hidden="true" /></span>Job Description</h3>
              <p>{job.description}</p>
            </section>
          </div>
        )}

        {/* Round 1 Tab: CV Review */}
        {activeTab === 'round1' && (
          <div>
            {/* Round 1 CV Review Stage Action Banner */}
            {job.stage === 'cv_review' && (
              <div className="card" style={{ 
                background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(6,182,212,0.1) 100%)',
                border: '1px solid rgba(99,102,241,0.3)',
                padding: '1.25rem 1.5rem',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <Sparkles size={18} color="var(--color-primary-light)" />
                    <h3 style={{ fontSize: '1.1rem' }}>Round 1: CV Review Active</h3>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Applications are ranked by CV score. Review rankings, adjust which candidates advance, and click Send AI Invitations.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>AI Slots Capacity</div>
                    <div style={{ 
                      fontWeight: 700, 
                      fontSize: '0.95rem',
                      color: advancingCount > (job.ai_capacity || 0) ? 'var(--color-danger)' : 'var(--color-success)'
                    }}>
                      {advancingCount} advancing / {job.ai_capacity || 0} slots
                    </div>
                  </div>
                  <button 
                    id="send-ai-invites-btn" 
                    className="btn btn-primary" 
                    style={{ padding: '0.65rem 1.35rem', boxShadow: '0 4px 14px rgba(99,102,241,0.4)' }}
                    disabled={advancingCount === 0 || advancingCount > (job.ai_capacity || 0)}
                    onClick={openSendModal}
                  >
                    <Send size={15} /> Send AI Invitations
                  </button>
                </div>
              </div>
            )}

            {/* Top Stat Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Submissions</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 800 }}>{totalCount}</span>
              </div>
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Evaluated & Scored</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-success)' }}>{doneCount}</span>
              </div>
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Processing</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-accent)' }}>{pendingCount}</span>
              </div>
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Needs Attention</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: failedCount > 0 ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
                  {failedCount}
                </span>
              </div>
            </div>

            {/* Controls Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: `All (${totalCount})` },
                  { key: 'done', label: `Scored (${doneCount})` },
                  { key: 'pending', label: `Processing (${pendingCount})` },
                  { key: 'failed', label: `Needs Attention (${failedCount})` },
                ].map(f => (
                  <button
                    key={f.key}
                    className={`btn ${filterStatus === f.key ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.825rem', padding: '0.4rem 0.85rem' }}
                    onClick={() => setFilterStatus(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button 
                className="btn btn-secondary" 
                style={{ fontSize: '0.825rem', padding: '0.4rem 0.85rem' }}
                onClick={() => refetchApps()}
              >
                <RefreshCw size={14} /> Refresh List
              </button>
            </div>

            {/* Applications List */}
            {loadingApps ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div className="spinner" style={{ margin: '0 auto 1rem', width: '2rem', height: '2rem' }} />
                <p>Loading candidate submissions...</p>
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
                <FileText size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
                <h3 style={{ marginBottom: '0.5rem' }}>No Applications Yet</h3>
                <p style={{ maxWidth: '420px', margin: '0 auto 1.5rem', color: 'var(--text-secondary)' }}>
                  Share the public application link with candidates to collect resumes for automated anonymization and evaluation.
                </p>
                {job.form_slug && (
                  <button className="btn btn-primary" onClick={copyLink}>
                    📋 Copy Candidate Apply Link
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredApps.map((app) => {
                  const score = app.cv_score
                  const isDone = app.processing_status === 'done'
                  const isFailed = app.processing_status === 'failed'
                  const isPending = app.processing_status === 'pending'
                  const isPastCvReview = !['draft', 'collecting', 'cv_review'].includes(job.stage)

                  return (
                    <div 
                      key={app.id} 
                      className="card" 
                      style={{ 
                        padding: '1.25rem 1.5rem', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        gap: '1rem',
                        flexWrap: 'wrap',
                        borderLeft: isFailed 
                          ? '4px solid var(--color-danger)' 
                          : app.advance_next && job.stage === 'cv_review'
                            ? '4px solid var(--color-primary)'
                            : isDone && score >= 75 
                              ? '4px solid var(--color-success)' 
                              : '4px solid var(--border-subtle)',
                      }}
                    >
                      {/* Left: Candidate Info & Breakdown */}
                      <div style={{ flex: '1 1 300px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                          {app.cv_rank && (
                            <span className="badge badge-accent" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                              #{app.cv_rank}
                            </span>
                          )}
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            {isPastCvReview && app.full_name ? app.full_name : app.candidate_label}
                          </span>
                          {app.pipeline_status && app.pipeline_status !== 'applied' && (
                            <span className={`badge ${
                              app.pipeline_status === 'ai_invited' ? 'badge-warning' :
                              app.pipeline_status === 'hr_invited' ? 'badge-primary' :
                              app.pipeline_status === 'selected' ? 'badge-success' : 'badge-danger'
                            }`} style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                              {app.pipeline_status.replace('_', ' ')}
                            </span>
                          )}
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Applied {formatDate(app.applied_at)}
                          </span>
                        </div>

                        {/* Breakdown pills if done */}
                        {isDone && app.score_breakdown && (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Skills: <strong>{app.score_breakdown.skills}/50</strong>
                            </span>
                            <span style={{ color: 'var(--border-subtle)' }}>•</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Exp: <strong>{app.score_breakdown.experience}/30</strong>
                            </span>
                            <span style={{ color: 'var(--border-subtle)' }}>•</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Edu: <strong>{app.score_breakdown.education}/20</strong>
                            </span>
                          </div>
                        )}

                        {isPending && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--color-accent)' }}>
                            <div className="spinner" style={{ width: '0.85rem', height: '0.85rem' }} />
                            Anonymizing & Evaluating CV with AI...
                          </div>
                        )}

                        {isFailed && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--color-danger)' }}>
                            <AlertTriangle size={14} /> Evaluation stalled or failed extraction. Please retry.
                          </div>
                        )}
                      </div>

                      {/* Right: Actions, Score & Advance Toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        {isDone && (
                          <div style={{ textAlign: 'right', minWidth: '70px' }}>
                            <div style={{ 
                              fontSize: '1.5rem', 
                              fontWeight: 800, 
                              color: score >= 75 ? 'var(--color-success)' : score >= 50 ? 'var(--color-primary-light)' : 'var(--text-muted)' 
                            }}>
                              {score}
                              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>/100</span>
                            </div>
                            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                              CV Score
                            </span>
                          </div>
                        )}

                        {/* Phase 4: Advance toggle during cv_review */}
                        {job.stage === 'cv_review' && isDone && (
                          <button
                            id={`advance-toggle-${app.id}`}
                            className={`btn ${app.advance_next ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ 
                              fontSize: '0.8rem', 
                              padding: '0.45rem 0.85rem',
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.4rem',
                              border: app.advance_next ? 'none' : '1px solid var(--border-subtle)'
                            }}
                            disabled={advancingAppId === app.id}
                            onClick={() => handleToggleAdvance(app)}
                            title={app.advance_next ? "Click to exclude from Round 2" : "Click to include in Round 2"}
                          >
                            {advancingAppId === app.id ? (
                              <div className="spinner" style={{ width: '0.85rem', height: '0.85rem' }} />
                            ) : app.advance_next ? (
                              <CheckSquare size={15} />
                            ) : (
                              <Square size={15} />
                            )}
                            {app.advance_next ? 'Advancing' : 'Excluded'}
                          </button>
                        )}

                        {/* Inspect details button */}
                        {isDone && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                            onClick={() => setSelectedCandidate(app)}
                          >
                            <Eye size={15} /> Inspect
                          </button>
                        )}

                        {/* Retry button for failed evaluation */}
                        {isFailed && (
                          <button 
                            className="btn btn-primary" 
                            style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem', background: 'var(--color-danger)' }}
                            disabled={retryingId === app.id}
                            onClick={() => handleRetry(app.id)}
                          >
                            {retryingId === app.id ? (
                              <div className="spinner" style={{ width: '1rem', height: '1rem' }} />
                            ) : (
                              <RefreshCw size={15} />
                            )}
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Round 2 Tab: AI Interviews */}
        {activeTab === 'round2' && (
          <div>
            {/* Banner: AI Review Stage */}
            {job.stage === 'ai_review' && (
              <div className="card" style={{ 
                background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(6,182,212,0.14) 100%)',
                border: '1px solid rgba(99,102,241,0.35)',
                padding: '1.25rem 1.5rem',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <Sparkles size={18} color="var(--color-primary-light)" />
                    <h3 style={{ fontSize: '1.1rem' }}>Round 2: AI Review Active</h3>
                    <span className="badge badge-accent" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      Target Finalists: {job.final_shortlist_count}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    AI evaluations complete. Candidates are ranked by AI score (with CV score tie-breakers). Review justifications, inspect transcripts, adjust advancements, and press Send HR Invitations.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Advancing: <strong style={{ color: 'var(--color-success)' }}>{round2Apps.filter(a => a.advance_next).length}</strong> / {job.final_shortlist_count}
                  </span>
                  <button 
                    id="send-hr-invites-btn"
                    className="btn btn-primary" 
                    style={{ padding: '0.65rem 1.35rem', background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)' }}
                    onClick={openSendModal}
                  >
                    <Send size={15} /> Send HR Invitations
                  </button>
                </div>
              </div>
            )}

            {/* Banner: AI Interview Stage (In progress) */}
            {job.stage === 'ai_interview' && (
              <div className="card" style={{ 
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '1.25rem 1.5rem',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="spinner" style={{ width: '1.25rem', height: '1.25rem', borderColor: 'var(--color-warning)', borderTopColor: 'transparent' }} />
                  <div>
                    <h4 style={{ color: 'var(--color-warning)', marginBottom: '0.2rem' }}>AI Interviews In Progress</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Candidates are conducting their allocated voice interviews. Once all sessions conclude and automated scoring is complete, Round 2 review will unlock.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Filters Bar for Round 2 */}
            {round2Apps.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Filter:</span>
                {[
                  { key: 'all', label: `All (${round2Apps.length})` },
                  { key: 'completed', label: `Completed (${round2Apps.filter(a => a.ai_interview?.status === 'completed').length})` },
                  { key: 'in_progress', label: `Scheduled / Active (${round2Apps.filter(a => ['scheduled', 'in_progress'].includes(a.ai_interview?.status)).length})` },
                  { key: 'no_show', label: `No Show / Incomplete (${round2Apps.filter(a => ['no_show', 'incomplete'].includes(a.ai_interview?.status)).length})` },
                  { key: 'advancing', label: `Advancing (${round2Apps.filter(a => a.advance_next).length})` },
                ].map(f => (
                  <button 
                    key={f.key}
                    className={`btn ${round2Filter === f.key ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                    onClick={() => setRound2Filter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {round2Apps.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤖</p>
                <h3 style={{ marginBottom: '0.5rem' }}>No Candidates in Round 2 Yet</h3>
                <p style={{ maxWidth: '480px', margin: '0 auto', color: 'var(--text-secondary)' }}>
                  Once Round 1 CV screening is finished and invitations are sent, candidates will appear here for automated AI voice interviewing.
                </p>
              </div>
            ) : filteredRound2Apps.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                <p style={{ color: 'var(--text-secondary)' }}>No candidates match the selected filter.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {filteredRound2Apps.map(app => {
                  const intv = app.ai_interview
                  const aiResult = intv?.ai_result
                  const aiScore = aiResult?.score
                  const isCompleted = intv?.status === 'completed'
                  const isNoShow = intv?.status === 'no_show'
                  const isIncomplete = intv?.status === 'incomplete'
                  const isInProgress = intv?.status === 'in_progress'
                  const isScheduled = intv?.status === 'scheduled'
                  const hasTranscript = getTranscriptTurns(aiResult?.transcript).length > 0

                  return (
                    <div 
                      key={app.id} 
                      className="card" 
                      style={{ 
                        padding: '1.25rem 1.5rem', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        gap: '1rem',
                        flexWrap: 'wrap',
                        borderLeft: isNoShow || isIncomplete
                          ? '4px solid var(--color-danger)'
                          : app.advance_next && job.stage === 'ai_review'
                            ? '4px solid var(--color-primary)'
                            : isCompleted && aiScore >= 75
                              ? '4px solid var(--color-success)'
                              : '4px solid var(--border-subtle)',
                      }}
                    >
                      {/* Left: Info, Status & Score Breakdown */}
                      <div style={{ flex: '1 1 320px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            {app.full_name || app.candidate_label}
                          </span>
                          {app.email && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              ({app.email})
                            </span>
                          )}

                          {/* Status Badge */}
                          {isCompleted && (
                            <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                              ✓ AI Completed
                            </span>
                          )}
                          {isInProgress && (
                            <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                              In Progress
                            </span>
                          )}
                          {isScheduled && (
                            <span className="badge badge-accent" style={{ fontSize: '0.75rem' }}>
                              Scheduled {intv?.start_at ? formatDate(intv.start_at) : ''}
                            </span>
                          )}
                          {isNoShow && (
                            <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>
                              No Show
                            </span>
                          )}
                          {isIncomplete && (
                            <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>
                              Incomplete
                            </span>
                          )}
                        </div>

                        {/* Breakdown pills if AI evaluation completed */}
                        {isCompleted && aiResult?.score_breakdown?.scores && (
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.35rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Tech: <strong>{aiResult.score_breakdown.scores.technical}/40</strong>
                            </span>
                            <span style={{ color: 'var(--border-subtle)' }}>•</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Depth: <strong>{aiResult.score_breakdown.scores.depth}/25</strong>
                            </span>
                            <span style={{ color: 'var(--border-subtle)' }}>•</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Comm: <strong>{aiResult.score_breakdown.scores.communication}/20</strong>
                            </span>
                            <span style={{ color: 'var(--border-subtle)' }}>•</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Rel: <strong>{aiResult.score_breakdown.scores.relevance}/15</strong>
                            </span>
                          </div>
                        )}

                        {/* Justification snippet */}
                        {isCompleted && aiResult?.score_breakdown?.justification && (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '540px', lineHeight: 1.4 }}>
                            "{aiResult.score_breakdown.justification}"
                          </p>
                        )}

                        {isCompleted && aiResult?.scoring_status === 'pending' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--color-accent)' }}>
                            <div className="spinner" style={{ width: '0.85rem', height: '0.85rem' }} />
                            Evaluating interview transcript...
                          </div>
                        )}
                      </div>

                      {/* Right: Scores & Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        {/* AI Score */}
                        {isCompleted && aiScore !== undefined && aiScore !== null && (
                          <div style={{ textAlign: 'right', minWidth: '70px' }}>
                            <div style={{ 
                              fontSize: '1.5rem', 
                              fontWeight: 800, 
                              color: aiScore >= 75 ? 'var(--color-success)' : aiScore >= 55 ? 'var(--color-primary-light)' : 'var(--text-muted)' 
                            }}>
                              {aiScore}
                              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>/100</span>
                            </div>
                            <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                              AI Score
                            </span>
                          </div>
                        )}

                        {/* CV Score reference */}
                        <div style={{ textAlign: 'right', minWidth: '55px', borderLeft: '1px solid var(--border-card)', paddingLeft: '0.75rem' }}>
                          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            {app.cv_score}
                          </div>
                          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            CV Score
                          </span>
                        </div>

                        {/* Advance toggle during ai_review */}
                        {job.stage === 'ai_review' && !isNoShow && (
                          <button
                            id={`advance-toggle-${app.id}`}
                            className={`btn ${app.advance_next ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ 
                              fontSize: '0.8rem', 
                              padding: '0.45rem 0.85rem',
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.4rem',
                              border: app.advance_next ? 'none' : '1px solid var(--border-subtle)'
                            }}
                            disabled={advancingAppId === app.id}
                            onClick={() => handleToggleAdvance(app)}
                            title={app.advance_next ? "Click to exclude from Round 3" : "Click to include in Round 3"}
                          >
                            {advancingAppId === app.id ? (
                              <div className="spinner" style={{ width: '0.85rem', height: '0.85rem' }} />
                            ) : app.advance_next ? (
                              <CheckSquare size={15} />
                            ) : (
                              <Square size={15} />
                            )}
                            {app.advance_next ? 'Advancing' : 'Excluded'}
                          </button>
                        )}

                        {/* View Transcript Button */}
                        {hasTranscript && (
                          <button 
                            id={`view-transcript-${app.id}`}
                            className="btn btn-secondary" 
                            style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                            onClick={() => setSelectedTranscriptApp(app)}
                          >
                            <MessageSquare size={15} /> Transcript
                          </button>
                        )}

                        {/* Inspect details button */}
                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                          onClick={() => setSelectedCandidate(app)}
                        >
                          <Eye size={15} /> Details
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Round 3 Tab: HR Interviews */}
        {activeTab === 'round3' && (
          <div>
            {job.stage === 'hr_review' && (
              <div className="card" style={{ 
                background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(6,182,212,0.1) 100%)',
                border: '1px solid rgba(99,102,241,0.3)',
                padding: '1.25rem 1.5rem',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <Sparkles size={18} color="var(--color-primary-light)" />
                    <h3 style={{ fontSize: '1.1rem' }}>Round 3: HR Review Active</h3>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    All HR video meetings have completed. Submit decisions and send final job offers and regrets.
                  </p>
                </div>

                <button 
                  className="btn btn-primary" 
                  style={{ padding: '0.65rem 1.35rem' }}
                  onClick={openSendModal}
                >
                  <Send size={15} /> Send Final Results
                </button>
              </div>
            )}

            {job.stage === 'hr_interview' && (
              <div className="card" style={{ 
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.25)',
                padding: '1rem 1.25rem',
                marginBottom: '1.5rem',
                display: 'flex', alignItems: 'center', gap: '0.75rem'
              }}>
                <Video size={20} color="var(--color-primary-light)" />
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.1rem' }}>HR Video Interviews Active</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Live video interviews are scheduled. Join each room at the allocated time using the buttons below.
                  </p>
                </div>
              </div>
            )}

            {round3Apps.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎥</p>
                <h3 style={{ marginBottom: '0.5rem' }}>No Candidates in Round 3 Yet</h3>
                <p style={{ maxWidth: '480px', margin: '0 auto', color: 'var(--text-secondary)' }}>
                  Candidates shortlisted after Round 2 will appear here for live video interviews with your hiring team.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {round3Apps.map(app => {
                  const intv = app.hr_interview
                  const fb = intv?.feedback
                  const isScheduled = intv?.status === 'scheduled'
                  const isInProgress = intv?.status === 'in_progress'
                  const isCompleted = intv?.status === 'completed'
                  const isNoShow = intv?.status === 'no_show' || intv?.status === 'incomplete'
                  const hasFeedback = !!fb

                  return (
                    <div
                      key={app.id}
                      className="card"
                      style={{
                        padding: '1.25rem 1.5rem',
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                        borderLeft: isNoShow
                          ? '4px solid var(--color-danger)'
                          : isCompleted && fb?.decision === 'selected'
                            ? '4px solid var(--color-success)'
                            : isCompleted && fb?.decision === 'rejected'
                              ? '4px solid var(--color-danger)'
                              : isCompleted
                                ? '4px solid var(--color-accent)'
                                : '4px solid var(--border-subtle)',
                      }}
                    >
                      {/* Left info */}
                      <div style={{ flex: '1 1 320px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{app.full_name || app.candidate_label}</span>
                          {app.email && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({app.email})</span>}

                          {isScheduled && (
                            <span className="badge badge-accent" style={{ fontSize: '0.75rem' }}>
                              <Clock size={11} /> Scheduled
                            </span>
                          )}
                          {isInProgress && (
                            <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>In Progress</span>
                          )}
                          {isCompleted && !hasFeedback && (
                            <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>Completed · Pending Feedback</span>
                          )}
                          {isCompleted && fb?.decision === 'selected' && (
                            <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>✓ Selected</span>
                          )}
                          {isCompleted && fb?.decision === 'rejected' && (
                            <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>✗ Rejected</span>
                          )}
                          {isNoShow && (
                            <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>No Show</span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          CV: <strong>{app.cv_score}/100</strong>
                          {app.ai_interview?.ai_result?.score != null && (
                            <> · AI Score: <strong>{app.ai_interview.ai_result.score}/100</strong></>
                          )}
                          {intv?.start_at && (
                            <> · Interview: <strong>{formatDate(intv.start_at)}</strong></>
                          )}
                        </div>

                        {hasFeedback && (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {fb.rating && <><Award size={12} style={{ verticalAlign: 'middle' }} /> Rating: <strong>{fb.rating}/10</strong> · </>}
                            {fb.notes && <span style={{ fontStyle: 'italic' }}>"{fb.notes.slice(0,80)}{fb.notes.length > 80 ? '…' : ''}"</span>}
                          </div>
                        )}
                      </div>

                      {/* Right actions */}
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {intv && (isScheduled || isInProgress) && (
                          <Link
                            id={`join-room-${app.id}`}
                            to={`/interviews/${intv.id}/room`}
                            className="btn btn-primary"
                            style={{
                              fontSize: '0.85rem', padding: '0.5rem 1rem',
                              background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                            }}
                          >
                            <Video size={14} /> Join Room
                          </Link>
                        )}

                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                          onClick={() => setSelectedCandidate(app)}
                        >
                          <Eye size={15} /> Details
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Candidate Inspection Modal */}
        {selectedCandidate && (
          <div 
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 9999, padding: '1rem'
            }}
            onClick={() => setSelectedCandidate(null)}
          >
            <div 
              className="card" 
              style={{
                maxWidth: '700px', width: '100%', maxHeight: '90vh',
                overflowY: 'auto', padding: '2rem', boxShadow: 'var(--shadow-card)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.35rem' }}>
                      {selectedCandidate.full_name || selectedCandidate.candidate_label}
                    </h2>
                    {!selectedCandidate.full_name && <span className="badge badge-primary">Blind Review</span>}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Applied on {formatDate(selectedCandidate.applied_at)}
                  </span>
                </div>

                <button 
                  onClick={() => setSelectedCandidate(null)} 
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={22} />
                </button>
              </div>

              {/* Rubric Breakdown Box */}
              <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--border-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <Award size={18} color="var(--color-primary-light)" /> AI Rubric Score
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-success)' }}>
                    {selectedCandidate.cv_score} / 100
                  </div>
                </div>

                {selectedCandidate.score_breakdown && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center', marginBottom: '1rem' }}>
                    <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Skills (max 50)</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedCandidate.score_breakdown.skills}</div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Experience (max 30)</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedCandidate.score_breakdown.experience}</div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Education (max 20)</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedCandidate.score_breakdown.education}</div>
                    </div>
                  </div>
                )}

                {selectedCandidate.score_breakdown?.reason && (
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                    <strong>Justification:</strong> {selectedCandidate.score_breakdown.reason}
                  </div>
                )}
              </div>

              {/* Anonymized CV Text */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.95rem' }}>
                  <Shield size={16} color="var(--color-accent)" /> Anonymized & Redacted CV
                </div>
                <div style={{ 
                  background: 'var(--bg-input)', padding: '1rem', borderRadius: 'var(--radius-md)', 
                  fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', 
                  fontFamily: 'monospace', maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-card)'
                }}>
                  {selectedCandidate.anonymized_text || 'No anonymized text generated.'}
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                <button className="btn btn-secondary" onClick={() => setSelectedCandidate(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 4 Send Preview Modal */}
        {showSendModal && (
          <div 
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 9999, padding: '1rem'
            }}
            onClick={() => !sendingInvites && setShowSendModal(false)}
          >
            <div 
              className="card" 
              style={{
                maxWidth: '650px', width: '100%', maxHeight: '90vh',
                overflowY: 'auto', padding: '2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Send size={22} color="var(--color-primary-light)" />
                  <h2 style={{ fontSize: '1.35rem' }}>
                    Send {sendPreviewData?.round_number === 1 ? 'AI Interview Invitations' : sendPreviewData?.round_number === 2 ? 'HR Interview Invitations' : 'Final Decisions'}
                  </h2>
                </div>
                {!sendingInvites && (
                  <button 
                    onClick={() => setShowSendModal(false)} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <X size={22} />
                  </button>
                )}
              </div>

              {loadingSendPreview ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto 1rem' }} />
                  <p>Calculating clash-free interview slots & preparing preview...</p>
                </div>
              ) : sendPreviewData ? (
                <div>
                  {/* Shortfall Error Banner if insufficient slots */}
                  {sendPreviewData.shortfall > 0 && (
                    <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
                      <AlertTriangle size={18} />
                      <div>
                        <strong>Insufficient Interview Slots!</strong>
                        <p style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                          You have a shortfall of <strong>{sendPreviewData.shortfall} slot(s)</strong>.
                          Please exclude {sendPreviewData.shortfall} candidate(s) or add more availability windows in Job Settings.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Advancing Candidates List */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Advancing Candidates ({sendPreviewData.advancing_count})</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {sendPreviewData.total_available_slots} total slots available
                      </span>
                    </h4>
                    
                    <div style={{ 
                      display: 'flex', flexDirection: 'column', gap: '0.5rem', 
                      maxHeight: '220px', overflowY: 'auto', background: 'var(--bg-surface)', 
                      padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-card)' 
                    }}>
                      {(sendPreviewData.advancing || []).map((cand, idx) => (
                        <div key={cand.application_id || idx} style={{ 
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                          padding: '0.5rem 0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                          fontSize: '0.85rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600 }}>{cand.candidate_label}</span>
                            {cand.full_name && <span style={{ color: 'var(--text-secondary)' }}>({cand.full_name})</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {cand.start_at_formatted ? (
                              <span style={{ color: 'var(--color-accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Clock size={13} /> {cand.start_at_formatted}
                              </span>
                            ) : (
                              <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>No slot</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Regret notice */}
                  {sendPreviewData.rejected_count > 0 && (
                    <div style={{ 
                      background: 'var(--bg-input)', padding: '1rem', borderRadius: 'var(--radius-md)', 
                      marginBottom: '1.5rem', border: '1px solid var(--border-card)' 
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={sendRegret} 
                          onChange={(e) => setSendRegret(e.target.checked)}
                          style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--color-primary)' }}
                        />
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          Send polite regret emails to {sendPreviewData.rejected_count} non-selected candidate(s)
                        </span>
                      </label>
                      <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginLeft: '1.85rem', marginTop: '0.25rem' }}>
                        If unchecked, these candidates will be marked rejected without an email notification.
                      </p>
                    </div>
                  )}

                  {/* Modal Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setShowSendModal(false)} 
                      disabled={sendingInvites}
                    >
                      Cancel
                    </button>
                    <button 
                      id="confirm-send-btn"
                      className="btn btn-primary" 
                      disabled={!sendPreviewData.can_send || sendingInvites || sendPreviewData.shortfall > 0}
                      onClick={handleConfirmSend}
                    >
                      {sendingInvites ? (
                        <>
                          <div className="spinner" style={{ width: '1rem', height: '1rem' }} />
                          Scheduling & Sending...
                        </>
                      ) : (
                        <>
                          <Send size={15} /> Confirm & Send Invitations
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Transcript Inspection Modal (Phase 5) */}
        {selectedTranscriptApp && (
          <div 
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 9999, padding: '1rem'
            }}
            onClick={() => setSelectedTranscriptApp(null)}
          >
            <div 
              className="card" 
              style={{
                maxWidth: '780px', width: '100%', maxHeight: '90vh',
                overflowY: 'auto', padding: '2rem', boxShadow: 'var(--shadow-card)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-card)', paddingBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <MessageSquare size={18} color="var(--color-primary-light)" />
                    <h3 style={{ fontSize: '1.25rem' }}>
                      AI Interview Transcript
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Candidate: <strong>{selectedTranscriptApp.full_name || selectedTranscriptApp.candidate_label}</strong>
                  </p>
                </div>

                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.35rem 0.6rem' }} 
                  onClick={() => setSelectedTranscriptApp(null)}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Rubric Evaluation Summary */}
              {selectedTranscriptApp.ai_interview?.ai_result && (
                <div style={{ marginBottom: '1.5rem', background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h4 style={{ fontSize: '0.95rem' }}>Evaluation Breakdown</h4>
                    <span className="badge badge-success" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      Total Score: {selectedTranscriptApp.ai_interview.ai_result.score}/100
                    </span>
                  </div>

                  {selectedTranscriptApp.ai_interview.ai_result.score_breakdown?.scores && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div className="card" style={{ padding: '0.75rem', textAlign: 'center', background: 'var(--bg-card)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Technical</span>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-primary-light)' }}>
                          {selectedTranscriptApp.ai_interview.ai_result.score_breakdown.scores.technical}/40
                        </div>
                      </div>
                      <div className="card" style={{ padding: '0.75rem', textAlign: 'center', background: 'var(--bg-card)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Depth</span>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-accent)' }}>
                          {selectedTranscriptApp.ai_interview.ai_result.score_breakdown.scores.depth}/25
                        </div>
                      </div>
                      <div className="card" style={{ padding: '0.75rem', textAlign: 'center', background: 'var(--bg-card)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Communication</span>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-success)' }}>
                          {selectedTranscriptApp.ai_interview.ai_result.score_breakdown.scores.communication}/20
                        </div>
                      </div>
                      <div className="card" style={{ padding: '0.75rem', textAlign: 'center', background: 'var(--bg-card)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Relevance</span>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-warning)' }}>
                          {selectedTranscriptApp.ai_interview.ai_result.score_breakdown.scores.relevance}/15
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedTranscriptApp.ai_interview.ai_result.score_breakdown?.justification && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic', borderLeft: '3px solid var(--color-primary)', paddingLeft: '0.75rem', marginTop: '0.5rem' }}>
                      "{selectedTranscriptApp.ai_interview.ai_result.score_breakdown.justification}"
                    </p>
                  )}
                </div>
              )}

              {/* Conversation Log */}
              {!Array.isArray(selectedTranscriptApp.ai_interview?.ai_result?.transcript) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="card" style={{ padding: '0.85rem 1rem', flex: '1 1 150px' }}>
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Total interview time</span>
                    <strong>{formatDuration(selectedTranscriptApp.ai_interview?.ai_result?.transcript?.total_duration_seconds)}</strong>
                  </div>
                  <div className="card" style={{ padding: '0.85rem 1rem', flex: '1 1 150px' }}>
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Candidate responses</span>
                    <strong>{getTranscriptTurns(selectedTranscriptApp.ai_interview?.ai_result?.transcript).filter(turn => turn.speaker === 'user' || turn.speaker === 'candidate').length}</strong>
                  </div>
                  {selectedTranscriptApp.ai_interview?.ai_result?.transcript?.started_at && (
                    <div className="card" style={{ padding: '0.85rem 1rem', flex: '1 1 220px' }}>
                      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Session started</span>
                      <strong>{formatDate(selectedTranscriptApp.ai_interview.ai_result.transcript.started_at)}</strong>
                    </div>
                  )}
                </div>
              )}

              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.5px' }}>
                Spoken Dialogue Turns
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {getTranscriptTurns(selectedTranscriptApp.ai_interview?.ai_result?.transcript).map((turn, i) => {
                  const isUser = turn.speaker === 'user' || turn.speaker === 'candidate'
                  return (
                    <div 
                      key={i} 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column',
                        alignItems: isUser ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                        {isUser ? (selectedTranscriptApp.full_name || 'Candidate') : 'AI Interviewer'}
                      </span>
                      <div style={{ 
                        maxWidth: '85%', 
                        padding: '0.75rem 1rem', 
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.875rem',
                        background: isUser ? 'var(--color-primary)' : 'var(--bg-surface)',
                        color: '#fff',
                        border: isUser ? 'none' : '1px solid var(--border-subtle)',
                        lineHeight: 1.5
                      }}>
                        {turn.text}
                      </div>
                      {(turn.time || (isUser && turn.response_duration_seconds !== undefined)) && (
                        <span style={{ marginTop: '0.3rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                          {isUser && turn.response_duration_seconds !== undefined && `Answer time: ${formatDuration(turn.response_duration_seconds)}`}
                          {isUser && turn.response_duration_seconds !== undefined && turn.time && ' · '}
                          {turn.time && new Date(turn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                <button className="btn btn-secondary" onClick={() => setSelectedTranscriptApp(null)}>
                  Close Transcript
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
