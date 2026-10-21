import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'HR'

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/dashboard" className="navbar-brand">
          <span className="logo-dot" />
          HireFlow
        </Link>

        <div className="navbar-spacer" />

        {user && (
          <div className="navbar-user">
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
                {user.full_name}
              </span>
              <span style={{ fontSize: '0.75rem' }}>{user.company_name}</span>
            </span>
            <div className="navbar-avatar">{initials}</div>
            <button className="btn btn-ghost" onClick={handleLogout} style={{ marginLeft: '0.25rem' }}>
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
