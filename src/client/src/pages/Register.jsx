import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { BrandLogo } from '../components/common/BrandLogo'

export default function Register() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    full_name: '', company_name: '', email: '', password: '',
    company_description: '', address: '', tz: 'Asia/Kolkata',
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setErrors(er => ({ ...er, [e.target.name]: '' }))
    setServerError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setServerError('')
    try {
      const res = await api.post('/accounts/register/', form)
      // Navigate to OTP verification with email state and optional dev_otp
      navigate('/verify-otp', { state: { email: form.email, dev_otp: res.data?.dev_otp } })
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        // Field-level errors
        const fieldErrors = {}
        for (const [key, val] of Object.entries(data)) {
          fieldErrors[key] = Array.isArray(val) ? val[0] : val
        }
        setErrors(fieldErrors)
      } else {
        setServerError('Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-wrapper" id="main-content">
      <div className="auth-card">
        <div className="auth-logo">
          <BrandLogo className="auth-brand-logo" />
          <h1>Create your account</h1>
          <p>Set up HireEngine for your company</p>
        </div>

        {serverError && (
          <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>{serverError}</div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="job-form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-full-name">Full Name *</label>
              <input id="reg-full-name" name="full_name" type="text" className={`form-input ${errors.full_name ? 'error' : ''}`}
                placeholder="Your full name" autoComplete="name" value={form.full_name} onChange={handleChange} required
                aria-invalid={Boolean(errors.full_name)} aria-describedby={errors.full_name ? 'reg-full-name-error' : undefined} />
              {errors.full_name && <span className="form-error" id="reg-full-name-error">{errors.full_name}</span>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-company-name">Company Name *</label>
              <input id="reg-company-name" name="company_name" type="text" className={`form-input ${errors.company_name ? 'error' : ''}`}
                placeholder="Company name" autoComplete="organization" value={form.company_name} onChange={handleChange} required
                aria-invalid={Boolean(errors.company_name)} aria-describedby={errors.company_name ? 'reg-company-name-error' : undefined} />
              {errors.company_name && <span className="form-error" id="reg-company-name-error">{errors.company_name}</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Work Email *</label>
            <input id="reg-email" name="email" type="email" className={`form-input ${errors.email ? 'error' : ''}`}
              placeholder="you@company.com" autoComplete="email" spellCheck={false}
              value={form.email} onChange={handleChange} required
              aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'reg-email-error' : undefined} />
            {errors.email && <span className="form-error" id="reg-email-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password *</label>
            <input id="reg-password" name="password" type="password" className={`form-input ${errors.password ? 'error' : ''}`}
              placeholder="At least 8 characters" autoComplete="new-password"
              value={form.password} onChange={handleChange} required
              aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'reg-password-error' : undefined} />
            {errors.password && <span className="form-error" id="reg-password-error">{errors.password}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-company-desc">Company Description</label>
            <textarea id="reg-company-desc" name="company_description" className="form-textarea"
              placeholder="A short description of what your company does…" value={form.company_description}
              onChange={handleChange} rows={2} />
          </div>

          <div className="job-form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-address">Office Address</label>
              <input id="reg-address" name="address" type="text" className="form-input"
                placeholder="City, Country" value={form.address} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-tz">Timezone</label>
              <select id="reg-tz" name="tz" className="form-select" value={form.tz} onChange={handleChange}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              </select>
            </div>
          </div>

          <button id="reg-submit" type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? <><span className="spinner" /> Creating account…</> : 'Create Account →'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </main>
  )
}
