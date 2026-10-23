import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { 
  Briefcase, MapPin, Calendar, UploadCloud,
  CheckCircle, AlertCircle, FileText, Check, ShieldCheck, ArrowRight, Building2
} from 'lucide-react'
import { Button } from '../components/common/Button'
import { BrandLogo } from '../components/common/BrandLogo'

const rawApiUrl = import.meta.env.VITE_API_URL
const API_BASE = (() => {
  if (!rawApiUrl) return '/api'
  const trimmed = rawApiUrl.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
})()

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export default function Apply() {
  const { slug } = useParams()
  
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [resumeFile, setResumeFile] = useState(null)
  const [consentGiven, setConsentGiven] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successData, setSuccessData] = useState(null)

  // Fetch job application form details
  const { data: job, isLoading, error } = useQuery({
    queryKey: ['public-job-form', slug],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/forms/${slug}/`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      })
      return res.data
    },
    retry: 1,
  })

  function handleFileSelect(file) {
    setErrorMsg('')
    if (!file) return

    const name = file.name.toLowerCase()
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      setErrorMsg('Invalid file type. Please upload a text-based PDF or DOCX file.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Resume file size exceeds the 5MB maximum limit.')
      return
    }

    setResumeFile(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')

    if (!fullName.trim() || !email.trim() || !phone.trim()) {
      setErrorMsg('Please complete all required fields.')
      return
    }

    if (!resumeFile) {
      setErrorMsg('Please upload your resume file (PDF or DOCX).')
      return
    }

    if (!consentGiven) {
      setErrorMsg('You must consent to data processing and the Privacy Policy to submit your application.')
      return
    }

    const formData = new FormData()
    formData.append('full_name', fullName.trim())
    formData.append('email', email.trim())
    formData.append('phone', phone.trim())
    formData.append('resume_file', resumeFile)
    formData.append('consent_given', 'true')

    setSubmitting(true)

    try {
      const res = await axios.post(`${API_BASE}/apply/${slug}/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'ngrok-skip-browser-warning': 'true',
        },
      })
      setSuccessData(res.data)
    } catch (err) {
      if (err.response?.status === 409) {
        setErrorMsg('Duplicate Application: An application with this email or phone number has already been submitted for this position.')
      } else if (err.response?.data?.resume_file) {
        const fileErr = Array.isArray(err.response.data.resume_file) 
          ? err.response.data.resume_file.join(' ') 
          : err.response.data.resume_file
        setErrorMsg(fileErr)
      } else if (err.response?.data?.error) {
        setErrorMsg(err.response.data.error)
      } else if (err.response?.status === 429) {
        setErrorMsg('Too many submission attempts. Please wait a minute and try again.')
      } else {
        setErrorMsg('Failed to submit application. Please check your network and try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div className="spinner" style={{ width: '2.5rem', height: '2.5rem' }} />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: '1.5rem' }}>
        <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '2.5rem' }}>
          <AlertCircle size={48} style={{ color: 'var(--color-danger)', margin: '0 auto 1rem' }} />
          <h2 style={{ marginBottom: '0.75rem' }}>Position Not Available</h2>
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
            This application link is either invalid, unpublished, or has expired.
          </p>
          <Link to="/privacy" className="btn btn-secondary">View Privacy Policy</Link>
        </div>
      </div>
    )
  }

  // Submission Success State
  if (successData) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '3rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: '560px', width: '100%', padding: '2.5rem', textAlign: 'center', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <CheckCircle size={36} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>Application Submitted!</h1>
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Thank you, <strong>{fullName}</strong>. Your application for <strong>{job.title}</strong> at <strong>{job.company_name}</strong> has been received successfully.
          </p>

          <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-md)', textAlign: 'left', marginBottom: '1.5rem', border: '1px solid var(--border-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary-light)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={18} /> What happens next?
            </div>
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <li>A confirmation email has been dispatched to <strong>{email}</strong>.</li>
              <li>Your CV will be automatically anonymized to redact personal identifying details for unbiased evaluation.</li>
              <li>Our recruitment team will review your application and notify you with any updates.</li>
            </ul>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Application Reference ID: <code style={{ color: 'var(--color-accent)' }}>{successData.application_id}</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="apply-page">
      <header className="apply-header">
        <Link to="/" className="apply-brand" aria-label="HireEngine home"><BrandLogo /></Link>
        <Link to="/privacy" className="apply-privacy-link">Privacy &amp; data protection <ArrowRight size={14} aria-hidden="true" /></Link>
      </header>
      <main className="apply-shell">
        
        {/* Company and Job Header */}
        <div className="card apply-job-card">
          <div className="apply-company-row">
            <span className="apply-company">
              <Building2 size={15} aria-hidden="true" />
              {job.company_name || 'Hiring Organization'}
            </span>
            {job.closed && (
              <span className="badge badge-danger apply-closed-badge">
                Applications Closed
              </span>
            )}
          </div>

          <h1 className="apply-job-title">
            {job.title}
          </h1>

          {/* Job Badges */}
          <div className="apply-job-meta">
            <span>
              <MapPin size={15} /> {job.location || 'Location not specified'}
            </span>
            <span>
              <Briefcase size={15} /> {job.employment_type?.replaceAll('_', ' ') || 'Employment type not specified'}
            </span>
            <span>
              <Building2 size={15} /> {job.work_mode || 'Work mode not specified'}
            </span>
            <span>
              <Calendar size={15} /> Apply by {formatDate(job.application_deadline)}
            </span>
          </div>

          {/* Job Description */}
          <div className="apply-role-description">
            <h2>About the Role</h2>
            <p>
              {job.description}
            </p>
          </div>

          {/* Required Skills */}
          {job.required_skills && job.required_skills.length > 0 && (
            <div className="apply-target-skills">
              <h2>Target Skills</h2>
              <div className="apply-skill-list">
                {job.required_skills.map((item, idx) => (
                  <span 
                    key={idx} 
                    className={`apply-skill ${item.level === 'must' ? 'apply-skill-required' : ''}`}
                  >
                    {item.skill} <span>· {item.level === 'must' ? 'Must have' : 'Nice to have'}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Closed Banner */}
        {job.closed ? (
          <div className="card apply-closed-card">
            <AlertCircle size={36} aria-hidden="true" />
            <h2>
              Applications Are Closed
            </h2>
            <p>
              {job.closed_reason || 'The application window for this position has closed. No further submissions are being accepted.'}
            </p>
          </div>
        ) : (
          /* Application Form Card */
          <section className="card apply-form-card">
            <div className="apply-form-heading">
              <span className="apply-form-heading-icon"><FileText size={19} aria-hidden="true" /></span>
              <div>
                <span className="apply-form-eyebrow">Your next opportunity</span>
                <h2>Submit Your Application</h2>
                <p>Share your details and resume to be considered for this role.</p>
              </div>
            </div>

            {errorMsg && (
              <div className="alert alert-error apply-error" role="alert">
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="apply-form">
              
              <div className="apply-form-field">
                <label className="form-label" htmlFor="fullName">Full Name <span>*</span></label>
                <input 
                  id="fullName" 
                  type="text" 
                  className="form-input"
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required 
                />
              </div>

              <div className="apply-contact-grid">
                <div className="apply-form-field">
                  <label className="form-label" htmlFor="email">Email Address <span>*</span></label>
                  <input 
                    id="email" 
                    type="email" 
                    className="form-input"
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required 
                  />
                </div>
                <div className="apply-form-field">
                  <label className="form-label" htmlFor="phone">Phone Number <span>*</span></label>
                  <input 
                    id="phone" 
                    type="tel" 
                    className="form-input"
                    placeholder="e.g. +91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    required 
                  />
                </div>
              </div>

              {/* Resume File Upload Dropzone */}
              <div className="apply-form-field">
                <label className="form-label" htmlFor="resumeFileInput">Resume Document <span>*</span></label>
                <p className="apply-upload-hint">PDF or DOCX · Maximum file size 5MB</p>
                <label
                  className={`apply-dropzone ${dragActive ? 'is-drag-active' : ''} ${resumeFile ? 'has-file' : ''}`}
                  htmlFor="resumeFileInput"
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
                  onDragOver={(e) => { e.preventDefault() }}
                  onDrop={handleDrop}
                >
                  <input 
                    id="resumeFileInput"
                    type="file" 
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="apply-file-input"
                    aria-label={resumeFile ? `Selected resume ${resumeFile.name}. Choose a different file.` : 'Choose a PDF or DOCX resume'}
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
                  />

                  {resumeFile ? (
                    <div className="apply-selected-file">
                      <span className="apply-upload-icon"><FileText size={21} aria-hidden="true" /></span>
                      <div className="apply-selected-file-copy">
                        <strong>{resumeFile.name}</strong>
                        <small>
                          {(resumeFile.size / 1024).toFixed(1)} KB · Click to change file
                        </small>
                      </div>
                      <span className="apply-file-ready"><Check size={14} aria-hidden="true" /> Ready</span>
                    </div>
                  ) : (
                    <div className="apply-upload-empty">
                      <span className="apply-upload-icon"><UploadCloud size={23} aria-hidden="true" /></span>
                      <strong>
                        Click to browse or drag and drop your resume
                      </strong>
                      <small>Text-based PDF or DOCX · Maximum 5MB</small>
                    </div>
                  )}
                </label>
              </div>

              {/* Mandatory Consent Checkbox */}
              <div className="apply-compliance-notice">
                <input 
                  id="consentCheckbox"
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  required
                />
                <label htmlFor="consentCheckbox">
                  I consent to the collection and automated processing of my resume in accordance with the{' '}
                  <Link to="/privacy" target="_blank" style={{ color: 'var(--text-link)', textDecoration: 'underline' }}>
                    HireEngine Privacy Policy
                  </Link>. I understand that personal details will be anonymized before evaluation.
                </label>
              </div>

              {/* Submit Button */}
              <Button
                id="apply-submit-btn"
                type="submit" 
                className="apply-submit"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <div className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                    Submitting Application...
                  </>
                ) : (
                  <>Submit Application <ArrowRight size={17} aria-hidden="true" /></>
                )}
              </Button>

              <p className="apply-form-footnote"><ShieldCheck size={14} aria-hidden="true" /> Your information is handled securely and used only for this application.</p>
            </form>
          </section>
        )}

        <footer className="apply-footer">
          <BrandLogo />
          <span>Powered by HireEngine</span>
          <Link to="/privacy">Privacy Policy</Link>
        </footer>
      </main>
    </div>
  )
}
