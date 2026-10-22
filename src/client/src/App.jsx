import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import Register from './pages/Register'
import VerifyOtp from './pages/VerifyOtp'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import JobForm from './pages/JobForm'
import JobDetail from './pages/JobDetail'
import Apply from './pages/Apply'
import Privacy from './pages/Privacy'
import AIInterviewRoom from './pages/AIInterviewRoom'
import HRInterviewRoom from './pages/HRInterviewRoom'
import HRInterviewHRRoom from './pages/HRInterviewHRRoom'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="auth-wrapper"><div className="spinner" /></div>
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function GuestRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="auth-wrapper"><div className="spinner" /></div>
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<GuestRoute><Landing /></GuestRoute>} />
            
            {/* Public Candidate & Policy Routes */}
            <Route path="/apply/:slug" element={<Apply />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/interview/ai/:token" element={<AIInterviewRoom />} />
            {/* Phase 6: HR video interview candidate room */}
            <Route path="/interview/hr/:token" element={<HRInterviewRoom />} />

            {/* Auth Routes */}
            <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
            <Route path="/verify-otp" element={<GuestRoute><VerifyOtp /></GuestRoute>} />
            <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />

            {/* Protected HR Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/jobs/new" element={<ProtectedRoute><JobForm /></ProtectedRoute>} />
            <Route path="/jobs/:id/edit" element={<ProtectedRoute><JobForm /></ProtectedRoute>} />
            <Route path="/jobs/:id" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
            {/* Phase 6: HR-side interview room */}
            <Route path="/interviews/:interviewId/room" element={<ProtectedRoute><HRInterviewHRRoom /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
