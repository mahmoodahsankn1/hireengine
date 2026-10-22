import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { BrandLogo } from '../components/common/BrandLogo'

export default function Login() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/accounts/login/', form)
      login({ access: res.data.access, refresh: res.data.refresh }, res.data.user)
      navigate('/dashboard')
    } catch (err) {
      const data = err.response?.data
      if (data?.detail) {
        setError(data.detail)
      } else if (data?.code === 'email_not_verified') {
        setError('Email not verified.')
      } else if (!err.response) {
        setError('Cannot connect to backend server. Please verify the backend tunnel is running.')
      } else {
        setError('Invalid email or password.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">
          <BrandLogo className="auth-brand-logo" />
          <h1>Welcome back</h1>
          <p>Sign in to your HireEngine account</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            {error}
            {error.includes('not verified') && (
              <Link to="/register" style={{ marginLeft: '0.5rem' }}>Verify email →</Link>
            )}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input id="login-email" name="email" type="email" className="form-input"
              placeholder="you@company.com" value={form.email} onChange={handleChange} required autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input id="login-password" name="password" type="password" className="form-input"
              placeholder="••••••••" value={form.password} onChange={handleChange} required />
          </div>

          <button id="login-submit" type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? <><span className="spinner" /> Signing in…</> : 'Sign In →'}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>
      </div>
    </div>
  )
}
