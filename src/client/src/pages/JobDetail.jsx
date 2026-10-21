import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { 
  FileText, CheckCircle, AlertTriangle, RefreshCw, Eye, 
  X, Sparkles, Award, Shield, User, ArrowRight 
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

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [retryingId, setRetryingId] = useState(null)

  const { data: job, isLoading, error, refetch } = useQuery({
    queryKey: ['job-detail', id],
    queryFn: () => api.get(`/jobs/${id}/`).then(r => r.data),
  })

  // Round 1 Applications Query
  const { 
    data: applications = [], 
    isLoading: loadingApps, 
    refetch: refetchApps 
  } = useQuery({
    queryKey: ['job-applications', id],
    queryFn: () => api.get(`/applications/?job=${id}`).then(r => r.data),
    enabled: activeTab === 'round1',
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
            { key: 'round1',   label: `Round 1 · CV (${totalCount || job.applications_count || 0})` },
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '1.5rem' }}>
                {(job.required_skills || []).map((sk, i) => (
                  <span key={i} className={`badge ${sk.level === 'must' ? 'badge-danger' : 'badge-muted'}`}>
                    {sk.skill} · {sk.level}
                  </span>
                ))}
              </div>

              <h3 style={{ marginBottom: '0.75rem' }}>Capacity & Allocation</h3>
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

        {/* Round 1 Tab: CV Review */}
        {activeTab === 'round1' && (
          <div>
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
                          : isDone && score >= 75 
                            ? '4px solid var(--color-success)' 
                            : '4px solid var(--border-subtle)',
                      }}
                    >
                      {/* Left: Blind Info & Timestamp */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            {app.candidate_label}
                          </span>
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

                      {/* Right: Score Badge & Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {isDone && (
                          <div style={{ textAlign: 'right' }}>
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

                        {isFailed && (
                          <span className="badge badge-danger" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                            Needs Attention
                          </span>
                        )}

                        {/* Detail / Inspection Button */}
                        {isDone && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}
                            onClick={() => setSelectedCandidate(app)}
                          >
                            <Eye size={15} /> Inspect
                          </button>
                        )}

                        {/* Retry Button for Failed */}
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
                        <h2 style={{ fontSize: '1.35rem' }}>{selectedCandidate.candidate_label}</h2>
                        <span className="badge badge-primary">Blind Review</span>
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
