import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { 
  Briefcase, MapPin, Clock, Calendar, UploadCloud, 
  CheckCircle, AlertCircle, FileText, Check, ShieldCheck 
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

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
      const res = await axios.get(`${API_BASE}/forms/${slug}/`)
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
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '2rem 1rem' }}>
      <div className="container" style={{ maxWidth: '780px', margin: '0 auto' }}>
        
        {/* Company and Job Header */}
        <div className="card" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary-light)' }}>
              {job.company_name || 'Hiring Organization'}
            </span>
            {job.closed && (
              <span className="badge badge-danger" style={{ marginLeft: 'auto' }}>
                Applications Closed
              </span>
            )}
          </div>

          <h1 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)', fontWeight: 800, marginBottom: '0.75rem' }}>
            {job.title}
          </h1>

          {/* Job Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <MapPin size={15} color="var(--color-accent)" /> {job.location}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <Briefcase size={15} color="var(--color-primary-light)" /> {job.employment_type?.replace('_', ' ')} · {job.work_mode}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <Calendar size={15} color="var(--color-warning)" /> Deadline: {formatDate(job.application_deadline)}
            </span>
          </div>

          {/* Job Description */}
          <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>About the Role</h3>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.925rem', lineHeight: '1.65', color: 'var(--text-secondary)' }}>
              {job.description}
            </p>
          </div>

          {/* Required Skills */}
          {job.required_skills && job.required_skills.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.625rem' }}>Target Skills</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {job.required_skills.map((item, idx) => (
                  <span 
                    key={idx} 
                    className={`badge ${item.level === 'must' ? 'badge-primary' : 'badge-muted'}`}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                  >
                    {item.skill} {item.level === 'must' ? '· Must have' : '· Nice to have'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Closed Banner */}
        {job.closed ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
            <AlertCircle size={36} style={{ color: 'var(--color-danger)', margin: '0 auto 0.75rem' }} />
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--color-danger)' }}>
              Applications Are Closed
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', maxWidth: '480px', margin: '0 auto' }}>
              {job.closed_reason || 'The application window for this position has closed. No further submissions are being accepted.'}
            </p>
          </div>
        ) : (
          /* Application Form Card */
          <div className="card" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.5rem' }}>Submit Your Application</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Upload your resume for automated anonymization and evaluation. Ensure your document is a text-based PDF or DOCX file.
            </p>

            {errorMsg && (
              <div className="alert alert-error" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div>
                <label className="form-label" htmlFor="fullName">Full Name *</label>
                <input 
                  id="fullName" 
                  type="text" 
                  className="input" 
                  placeholder="e.g. John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label className="form-label" htmlFor="email">Email Address *</label>
                  <input 
                    id="email" 
                    type="email" 
                    className="input" 
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="phone">Phone Number *</label>
                  <input 
                    id="phone" 
                    type="tel" 
                    className="input" 
                    placeholder="e.g. +91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required 
                  />
                </div>
              </div>

              {/* Resume File Upload Dropzone */}
              <div>
                <label className="form-label">Resume Document (PDF or DOCX, max 5MB) *</label>
                <div 
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
                  onDragOver={(e) => { e.preventDefault() }}
                  onDrop={handleDrop}
                  style={{
                    border: `2px dashed ${dragActive ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '2rem 1.5rem',
                    textAlign: 'center',
                    background: dragActive ? 'rgba(99,102,241,0.08)' : 'var(--bg-input)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => document.getElementById('resumeFileInput')?.click()}
                >
                  <input 
                    id="resumeFileInput"
                    type="file" 
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
                  />

                  {resumeFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                      <FileText size={28} color="var(--color-accent)" />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{resumeFile.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {(resumeFile.size / 1024).toFixed(1)} KB · Click to change file
                        </div>
                      </div>
                      <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>Ready</span>
                    </div>
                  ) : (
                    <div>
                      <UploadCloud size={36} color="var(--color-primary-light)" style={{ margin: '0 auto 0.75rem' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                        Click to browse or drag and drop your resume
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        Supports text-based PDF or DOCX format (Max 5MB)
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Mandatory Consent Checkbox */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginTop: '0.5rem' }}>
                <input 
                  id="consentCheckbox"
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  style={{ width: '1.25rem', height: '1.25rem', marginTop: '0.15rem', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                  required
                />
                <label htmlFor="consentCheckbox" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5', cursor: 'pointer' }}>
                  I consent to the collection and automated processing of my resume in accordance with the{' '}
                  <Link to="/privacy" target="_blank" style={{ color: 'var(--text-link)', textDecoration: 'underline' }}>
                    HireFlow Privacy Policy
                  </Link>. I understand that personal details will be anonymized before evaluation.
                </label>
              </div>

              {/* Submit Button */}
              <button 
                id="apply-submit-btn"
                type="submit" 
                className="btn btn-primary" 
                disabled={submitting}
                style={{ padding: '0.875rem', fontSize: '1rem', marginTop: '0.5rem', width: '100%', justifyContent: 'center' }}
              >
                {submitting ? (
                  <>
                    <div className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                    Submitting Application...
                  </>
                ) : (
                  'Submit Application →'
                )}
              </button>

            </form>
          </div>
        )}

      </div>
    </div>
  )
}
