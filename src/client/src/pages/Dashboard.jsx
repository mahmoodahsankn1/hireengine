import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api'
import Navbar from '../components/Navbar'
import { StatusBadge } from '../components/common/StatusBadge'
import { useAuth } from '../context/AuthContext'

const STAGE_LABELS = {
  draft: 'Draft', collecting: 'Collecting', cv_review: 'CV Review',
  ai_interview: 'AI Interview', ai_review: 'AI Review',
  hr_interview: 'HR Interview', hr_review: 'HR Review', completed: 'Completed'
}

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/jobs/dashboard/').then(r => r.data),
  })

  async function handleDelete(jobId, e) {
    e.stopPropagation()
    if (!confirm('Delete this job? This cannot be undone.')) return
    try {
      await api.delete(`/jobs/${jobId}/`)
      refetch()
    } catch {
      alert('Failed to delete job.')
    }
  }

  async function handlePublish(jobId, e) {
    e.stopPropagation()
    try {
      await api.post(`/jobs/${jobId}/publish/`)
      refetch()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to publish job.')
    }
  }

  async function copyLink(slug, e) {
    e.stopPropagation()
    const url = `${window.location.origin}/apply/${slug}`
    await navigator.clipboard.writeText(url)
    alert('Application link copied!')
  }

  if (isLoading) return (
    <>
      <Navbar />
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: '2rem', height: '2rem' }} />
      </div>
    </>
  )

  const stats = data?.stats || {}
  const jobs  = data?.jobs  || []

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">
              Welcome back, {user?.full_name?.split(' ')[0]} 👋
            </h1>
            <p className="page-subtitle">{user?.company_name} · HR Dashboard</p>
          </div>
          <Link to="/jobs/new" className="btn btn-primary btn-lg">
            + Post New Job
          </Link>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          {[
            { label: 'Active Jobs',          value: stats.active_jobs       ?? 0, icon: '💼' },
            { label: 'Total Applications',   value: stats.total_applications ?? 0, icon: '📋' },
            { label: 'CVs Needing Attention',value: stats.cvs_needing_attention ?? 0, icon: '⚠️' },
            { label: 'Upcoming Interviews',  value: stats.upcoming_interviews ?? 0, icon: '📅' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <span className="stat-icon">{s.icon}</span>
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Jobs list */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Your Jobs</h2>
        </div>

        {jobs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</p>
            <h3 style={{ marginBottom: '0.5rem' }}>No jobs yet</h3>
            <p style={{ marginBottom: '1.5rem' }}>Create your first job posting to start hiring.</p>
            <Link to="/jobs/new" className="btn btn-primary">Post a Job</Link>
          </div>
        ) : (
          <div className="jobs-grid">
            {jobs.map(job => (
              <div key={job.id} className="job-card" onClick={() => navigate(`/jobs/${job.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="job-card-title">{job.title}</span>
                  <StatusBadge stage={job.stage} label={STAGE_LABELS[job.stage] || job.stage} />
                </div>

                <div className="job-card-meta">
                  <span>📍 {job.location}</span>
                  <span>⏱️ {job.employment_type?.replace('_', ' ')}</span>
                  <span>🗓️ {formatDate(job.application_deadline)}</span>
                  <span>👥 {job.applications_count} applications</span>
                </div>

                <div className="job-card-actions">
                  {job.stage === 'draft' && (
                    <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
                      onClick={e => handlePublish(job.id, e)}>
                      Publish
                    </button>
                  )}
                  {job.stage !== 'draft' && job.form_slug && (
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
                      onClick={e => copyLink(job.form_slug, e)}>
                      📋 Copy Link
                    </button>
                  )}
                  <Link to={`/jobs/${job.id}/edit`} className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
                    onClick={e => e.stopPropagation()}>
                    Edit
                  </Link>
                  {job.stage === 'draft' && (
                    <button className="btn btn-danger" style={{ fontSize: '0.8rem', padding: '0.4rem 0.875rem' }}
                      onClick={e => handleDelete(job.id, e)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
