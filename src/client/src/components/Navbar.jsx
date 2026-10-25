import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BrandLogo } from './common/BrandLogo'

export default function Navbar({ className = '' }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'HR'

  return (
    <header className={`navbar ${className}`.trim()}>
      <div className="navbar-inner">
        <Link to="/dashboard" className="navbar-brand" aria-label="HireEngine HR dashboard">
          <BrandLogo className="navbar-brand-content" />
        </Link>

        <nav className="navbar-links" aria-label="Workspace navigation">
          <NavLink to="/dashboard" end className={({ isActive }) => isActive ? 'active' : ''}>
            Dashboard
          </NavLink>
          <Link
            to="/jobs/new"
            className={location.pathname.startsWith('/jobs/') && location.pathname.endsWith('/edit') ? 'active' : ''}
            aria-current={location.pathname === '/jobs/new' || location.pathname.endsWith('/edit') ? 'page' : undefined}
          >
            Post a job
          </Link>
        </nav>

        <div className="navbar-spacer" />

        {user && (
          <div className="navbar-user">
            <div className="navbar-user-details">
              <span>{user.full_name}</span>
              <span>{user.company_name}</span>
            </div>
            <div className="navbar-avatar" aria-label={`${user.full_name || 'User'} account`}>
              {initials}
            </div>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
