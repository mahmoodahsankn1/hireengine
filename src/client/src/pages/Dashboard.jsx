import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CalendarPlus,
  Clock3,
  FileText,
  MapPin,
  Pencil,
  Plus,
  Search,
  UsersRound,
} from 'lucide-react'
import api from '../services/api'
import Navbar from '../components/Navbar'
import { StatusBadge } from '../components/common/StatusBadge'
import { useAuth } from '../context/AuthContext'

const STAGE_LABELS = {
  draft: 'Draft',
  collecting: 'Collecting',
  cv_review: 'CV Review',
  ai_interview: 'AI Interview',
  ai_review: 'AI Review',
  hr_interview: 'HR Interview',
  hr_review: 'HR Review',
  completed: 'Completed',
}

const STATS = [
  { key: 'active_jobs', label: 'Active Jobs', icon: BriefcaseBusiness, tone: 'blue', note: 'Open roles' },
  { key: 'total_applications', label: 'Total Applications', icon: FileText, tone: 'cyan', note: 'Across all roles' },
  { key: 'cvs_needing_attention', label: 'CVs Needing Attention', icon: AlertTriangle, tone: 'orange', note: 'Require review' },
  { key: 'upcoming_interviews', label: 'Upcoming Interviews', icon: CalendarDays, tone: 'violet', note: 'Scheduled ahead' },
]

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatEmploymentType(value) {
  if (!value) return 'Not specified'
  return value.replaceAll('_', ' ')
}

export default function Dashboard() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')

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
      <Navbar className="dashboard-navbar" />
      <div className="auth-wrapper"><div className="spinner" /></div>
    </>
  )

  if (error && !data) return (
    <>
      <Navbar className="dashboard-navbar" />
      <main className="dashboard-page">
        <div className="dashboard-error dashboard-error-block" role="alert">
          <span>We couldn’t load your dashboard. Please check your connection and try again.</span>
          <button type="button" onClick={() => refetch()}>Try again</button>
        </div>
      </main>
    </>
  )

  const stats = data?.stats || {}
  const jobs = data?.jobs || []
  const filteredJobs = jobs.filter(job => {
    const matchesStage = stageFilter === 'all' || job.stage === stageFilter
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || `${job.title} ${job.location || ''}`.toLowerCase().includes(query)
    return matchesStage && matchesSearch
  })

  return (
    <>
      <Navbar className="dashboard-navbar" />
      <main className="dashboard-page">
        <section className="dashboard-welcome">
          <div className="dashboard-welcome-copy">
            <span className="dashboard-eyebrow">HR Dashboard</span>
            <h1>Welcome back, <span>{user?.full_name?.split(' ')[0] || 'there'}</span> <span aria-hidden="true">👋</span></h1>
            <p>Manage your jobs, track applications, and find the right talent with Hire Engine.</p>
          </div>
          <Link to="/jobs/new" className="dashboard-create-job">
            <Plus size={18} aria-hidden="true" /> Post New Job
          </Link>
          <div className="dashboard-welcome-orb dashboard-welcome-orb-one" aria-hidden="true" />
          <div className="dashboard-welcome-orb dashboard-welcome-orb-two" aria-hidden="true" />
        </section>

        {error && (
          <div className="dashboard-error" role="alert">
            We couldn’t refresh your dashboard. Your displayed data may be out of date.
            <button type="button" onClick={() => refetch()}>Try again</button>
          </div>
        )}

        <section className="dashboard-stats" aria-label="Hiring overview">
          {STATS.map(({ key, label, icon: Icon, tone, note }) => {
            const value = stats[key] ?? 0
            return (
              <article className="dashboard-stat-card" key={key}>
                <span className={`dashboard-stat-icon tone-${tone}`}><Icon size={21} aria-hidden="true" /></span>
                <div className="dashboard-stat-content">
                  <span className="dashboard-stat-label">{label}</span>
                  <strong className="dashboard-stat-value">{value}</strong>
                  <span className={`dashboard-stat-note ${value > 0 && (key === 'cvs_needing_attention' || key === 'upcoming_interviews') ? 'note-attention' : ''}`}>
                    {value > 0 ? `${value} ${note.toLowerCase()}` : key === 'cvs_needing_attention' ? 'No pending reviews' : key === 'upcoming_interviews' ? 'No interviews scheduled' : note}
                  </span>
                </div>
              </article>
            )
          })}
        </section>

        <section className="dashboard-jobs-section">
          <div className="dashboard-jobs-heading">
            <div>
              <h2>Your Jobs <span>({jobs.length})</span></h2>
              <p>Manage and track all your job postings</p>
            </div>
            <div className="dashboard-job-filters">
              <label className="dashboard-search">
                <Search size={17} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search jobs..."
                  aria-label="Search jobs by title or location"
                />
              </label>
              <label className="dashboard-stage-filter">
                <span className="sr-only">Filter jobs by status</span>
                <select value={stageFilter} onChange={event => setStageFilter(event.target.value)}>
                  <option value="all">All Status</option>
                  {Object.entries(STAGE_LABELS).map(([stage, label]) => (
                    <option key={stage} value={stage}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="dashboard-empty">
              <span className="dashboard-empty-icon"><BriefcaseBusiness size={25} aria-hidden="true" /></span>
              <h3>No jobs yet</h3>
              <p>Create your first job posting to start hiring.</p>
              <Link to="/jobs/new" className="dashboard-empty-link">Post a Job <ArrowRight size={16} /></Link>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="dashboard-empty dashboard-empty-filtered">
              <h3>No matching jobs</h3>
              <p>Try a different search or status filter.</p>
              <button type="button" onClick={() => { setSearch(''); setStageFilter('all') }}>Clear filters</button>
            </div>
          ) : (
            <div className="dashboard-job-grid">
              {filteredJobs.map(job => (
                <article key={job.id} className="dashboard-job-card">
                  <div className="dashboard-job-card-heading">
                    <h3><Link to={`/jobs/${job.id}`}>{job.title}</Link></h3>
                    <StatusBadge stage={job.stage} label={STAGE_LABELS[job.stage] || job.stage} />
                  </div>
                  <div className="dashboard-job-meta">
                    <span><MapPin size={15} aria-hidden="true" /> {job.location || 'Location not specified'}</span>
                    <span><Clock3 size={15} aria-hidden="true" /> {formatEmploymentType(job.employment_type)}</span>
                    <span><CalendarDays size={15} aria-hidden="true" /> {formatDate(job.application_deadline)}</span>
                    <span><UsersRound size={15} aria-hidden="true" /> {job.applications_count} applications</span>
                  </div>
                  <div className="dashboard-job-actions">
                    {job.stage === 'draft' ? (
                      <button type="button" className="dashboard-job-action action-outline" onClick={event => handlePublish(job.id, event)}>
                        <CalendarPlus size={16} aria-hidden="true" /> Publish
                      </button>
                    ) : job.form_slug ? (
                      <button type="button" className="dashboard-job-action action-outline" onClick={event => copyLink(job.form_slug, event)}>
                        <ArrowRight size={16} aria-hidden="true" /> Copy Link
                      </button>
                    ) : (
                      <span />
                    )}
                    <Link to={`/jobs/${job.id}/edit`} className="dashboard-job-action action-primary" onClick={event => event.stopPropagation()}>
                      <Pencil size={15} aria-hidden="true" /> Edit
                    </Link>
                    {job.stage === 'draft' && (
                      <button type="button" className="dashboard-job-delete" onClick={event => handleDelete(job.id, event)}>Delete</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
