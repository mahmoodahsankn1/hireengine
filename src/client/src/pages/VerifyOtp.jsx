import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function VerifyOtp() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
  const email      = location.state?.email || ''

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error,  setError]  = useState('')
  const [loading, setLoading] = useState(false)
  const [resendMsg, setResendMsg] = useState('')
  const [cooldown, setCooldown]   = useState(0)
  const inputRefs = useRef([])

  // Redirect back if no email in state
  useEffect(() => {
    if (!email) navigate('/register')
  }, [email, navigate])

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  function handleDigit(idx, val) {
    const char = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = char
    setDigits(next)
    setError('')
    if (char && idx < 5) inputRefs.current[idx + 1]?.focus()
  }

  function handleKeyDown(idx, e) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...digits]
    pasted.split('').forEach((c, i) => { next[i] = c })
    setDigits(next)
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const code = digits.join('')
    if (code.length < 6) { setError('Please enter all 6 digits.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/accounts/verify-otp/', { email, code })
      login({ access: res.data.access, refresh: res.data.refresh }, res.data.user)
      navigate('/dashboard')
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid code. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0) return
    setResendMsg('')
    setError('')
    try {
      await api.post('/accounts/resend-otp/', { email })
      setResendMsg('A new code has been sent to your email.')
      setCooldown(60)
    } catch (err) {
      const d = err.response?.data
      const retryAfter = d?.retry_after
      if (retryAfter) {
        setCooldown(retryAfter)
        setError(d.error)
      } else {
        setError(d?.error || 'Could not resend code.')
      }
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark">✉️</div>
          <h1>Verify your email</h1>
          <p>
            We sent a 6-digit code to<br />
            <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
          </p>
        </div>

        {error  && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        {resendMsg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{resendMsg}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="otp-inputs" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el }}
                id={`otp-digit-${i}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className="otp-input"
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
              />
            ))}
          </div>

          <button id="otp-submit" type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? <><span className="spinner" /> Verifying…</> : 'Verify & Sign In →'}
          </button>
        </form>

        <div className="auth-footer" style={{ marginTop: '1.25rem' }}>
          Didn't receive a code?{' '}
          <button
            id="otp-resend"
            onClick={handleResend}
            disabled={cooldown > 0}
            style={{ background: 'none', border: 'none', color: cooldown > 0 ? 'var(--text-muted)' : 'var(--text-link)',
              cursor: cooldown > 0 ? 'default' : 'pointer', font: 'inherit', fontWeight: 600 }}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </div>

        <div className="auth-footer">
          <Link to="/register">← Back to registration</Link>
        </div>
      </div>
    </div>
  )
}
