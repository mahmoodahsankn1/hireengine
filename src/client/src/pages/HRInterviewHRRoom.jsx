/**
 * HRInterviewHRRoom.jsx  – Phase 6
 * HR-facing live video interview room with side panel.
 * Route: /jobs/:jobId/interviews/:interviewId/room  (protected)
 *
 * Flow:
 *  1. POST /api/interviews/<id>/join -> get LiveKit token, server_url + candidate context
 *  2. Render <LiveKitRoom> with <VideoConference /> on left
 *  3. Side panel on right: candidate CV score, AI score, resume link, feedback form
 *  4. POST /api/interviews/<id>/feedback -> submit rating, notes, decision
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react'
import '@livekit/components-styles'
import api from '../services/api'
import {
  Video, Award, Star, FileText, ChevronRight,
  CheckCircle, XCircle, AlertTriangle, X, User,
} from 'lucide-react'

function ScorePill({ label, value, max, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
      padding: '0.65rem 0.75rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.1rem', color }}>
        {value ?? '—'}
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>/{max}</span>
      </div>
    </div>
  )
}

export default function HRInterviewHRRoom() {
  const { interviewId } = useParams()
  const navigate = useNavigate()

  const [roomData, setRoomData] = useState(null)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState(null)

  // Feedback form state
  const [decision, setDecision] = useState('')
  const [rating, setRating] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [feedbackError, setFeedbackError] = useState(null)

  const [showFeedbackPanel, setShowFeedbackPanel] = useState(false)
  const [inRoom, setInRoom] = useState(false)

  useEffect(() => {
    join()
  }, [interviewId])

  async function join() {
    setJoining(true)
    setJoinError(null)
    try {
      const res = await api.post(`/interviews/${interviewId}/join/`)
      setRoomData(res.data)
      setInRoom(true)
    } catch (err) {
      setJoinError(err.response?.data?.error || 'Failed to join interview room.')
    } finally {
      setJoining(false)
    }
  }

  async function handleSubmitFeedback(e) {
    e.preventDefault()
    if (!decision) {
      setFeedbackError('Please select a decision before submitting.')
      return
    }
    setSubmitting(true)
    setFeedbackError(null)
    try {
      await api.post(`/interviews/${interviewId}/feedback/`, {
        decision,
        rating: rating ? parseInt(rating) : null,
        notes,
      })
      setFeedbackDone(true)
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to submit feedback.'
      setFeedbackError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (joining) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0f1117',
      }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div className="spinner" style={{ width: '2.5rem', height: '2.5rem', margin: '0 auto 1rem', borderColor: 'rgba(99,102,241,0.3)', borderTopColor: '#6366f1' }} />
          <p>Joining interview room…</p>
        </div>
      </div>
    )
  }

  if (joinError) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0f1117', padding: '2rem',
      }}>
        <div style={{
          maxWidth: '480px', width: '100%', background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', color: '#fff',
        }}>
          <AlertTriangle size={40} color="#ef4444" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ marginBottom: '0.5rem' }}>Cannot Join Room</h2>
          <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>{joinError}</p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Go Back</button>
        </div>
      </div>
    )
  }

  if (!roomData) return null

  const ctx = roomData  // { token, server_url, candidate_name, cv_score, ai_score, resume_url, ... }

  return (
    <div style={{ height: '100vh', display: 'flex', background: '#0f1117', overflow: 'hidden' }}>
      {/* ── LiveKit Room (left / main) ── */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <LiveKitRoom
          serverUrl={ctx.server_url}
          token={ctx.token}
          connect={true}
          video={true}
          audio={true}
          style={{ height: '100%' }}
          onError={(err) => {
            console.error('LiveKit connection error:', err)
            setJoinError(`Connection error: ${err?.message || 'Could not connect to the meeting room. Please check your network and try again.'}`)
            setRoomData(null)
            setInRoom(false)
          }}
          onDisconnected={() => setInRoom(false)}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>

        {/* Floating toggle for side panel (mobile) */}
        <button
          id="toggle-side-panel-btn"
          onClick={() => setShowFeedbackPanel(v => !v)}
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'rgba(99,102,241,0.9)', border: 'none', borderRadius: '50%',
            width: '44px', height: '44px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, color: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          }}
          title="Toggle candidate panel"
        >
          {showFeedbackPanel ? <X size={18} /> : <User size={18} />}
        </button>
      </div>

      {/* Mobile backdrop overlay */}
      {showFeedbackPanel && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setShowFeedbackPanel(false)}
        />
      )}

      {/* ── HR Side Panel (right) ── */}
      <div
        className="hr-side-panel"
        style={{
          width: showFeedbackPanel ? 'min(100vw, 380px)' : '0',
          transition: 'width 0.25s ease',
          overflow: 'hidden',
          background: 'var(--bg-card)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ width: 'min(100vw, 380px)', height: '100%', overflowY: 'auto', padding: '1.5rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '0.15rem' }}>
                {ctx.candidate_name}
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{ctx.candidate_email}</p>
            </div>
            <button
              onClick={() => setShowFeedbackPanel(false)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Scores */}
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
              Evaluation Scores
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <ScorePill label="CV Score" value={ctx.cv_score} max={100} color="#06b6d4" />
              <ScorePill label="AI Interview" value={ctx.ai_score} max={100} color="#6366f1" />
            </div>
          </div>

          {/* Resume link */}
          {ctx.resume_url && (
            <a
              id="resume-link"
              href={ctx.resume_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 'var(--radius-md)', padding: '0.65rem 0.9rem',
                color: '#a5b4fc', textDecoration: 'none', fontSize: '0.85rem',
                marginBottom: '1.25rem', fontWeight: 500,
              }}
            >
              <FileText size={16} /> View Resume <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
            </a>
          )}

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 0 1.25rem' }} />

          {/* Feedback Form */}
          {feedbackDone ? (
            <div style={{
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 'var(--radius-md)', padding: '1.25rem', textAlign: 'center',
            }}>
              <CheckCircle size={32} color="#22c55e" style={{ margin: '0 auto 0.5rem' }} />
              <p style={{ color: '#86efac', fontWeight: 600 }}>Feedback Submitted</p>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: '0.25rem' }}>
                Decision: <strong style={{ color: '#fff' }}>{decision}</strong>
              </p>
              <button
                className="btn btn-secondary"
                style={{ marginTop: '1rem', width: '100%', fontSize: '0.85rem' }}
                onClick={() => navigate(-1)}
              >
                ← Back to Job
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitFeedback}>
              <p style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.9rem' }}>
                Interview Feedback
              </p>

              {/* Decision */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.82rem', color: '#cbd5e1', display: 'block', marginBottom: '0.4rem' }}>
                  Decision <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    id="decision-selected"
                    onClick={() => setDecision('selected')}
                    style={{
                      padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '2px solid',
                      borderColor: decision === 'selected' ? '#22c55e' : 'rgba(255,255,255,0.1)',
                      background: decision === 'selected' ? 'rgba(34,197,94,0.15)' : 'transparent',
                      color: decision === 'selected' ? '#86efac' : '#94a3b8',
                      cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                      transition: 'all 0.15s',
                    }}
                  >
                    <CheckCircle size={15} /> Select
                  </button>
                  <button
                    type="button"
                    id="decision-rejected"
                    onClick={() => setDecision('rejected')}
                    style={{
                      padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '2px solid',
                      borderColor: decision === 'rejected' ? '#ef4444' : 'rgba(255,255,255,0.1)',
                      background: decision === 'rejected' ? 'rgba(239,68,68,0.15)' : 'transparent',
                      color: decision === 'rejected' ? '#fca5a5' : '#94a3b8',
                      cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                      transition: 'all 0.15s',
                    }}
                  >
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              </div>

              {/* Rating */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.82rem', color: '#cbd5e1', display: 'block', marginBottom: '0.4rem' }}>
                  Rating (1–10) <span style={{ color: '#64748b', fontWeight: 400 }}>optional</span>
                </label>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button
                      key={n}
                      type="button"
                      id={`rating-${n}`}
                      onClick={() => setRating(rating === String(n) ? '' : String(n))}
                      style={{
                        width: '30px', height: '30px',
                        borderRadius: 'var(--radius-sm)', border: '1px solid',
                        borderColor: rating === String(n) ? '#6366f1' : 'rgba(255,255,255,0.12)',
                        background: rating === String(n) ? '#6366f1' : 'transparent',
                        color: rating === String(n) ? '#fff' : '#94a3b8',
                        cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem',
                        transition: 'all 0.12s',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.82rem', color: '#cbd5e1', display: 'block', marginBottom: '0.4rem' }}>
                  Notes <span style={{ color: '#64748b', fontWeight: 400 }}>optional</span>
                </label>
                <textarea
                  id="feedback-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Key observations, strengths, areas of concern…"
                  rows={4}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)',
                    color: '#e2e8f0', padding: '0.65rem 0.85rem', fontSize: '0.85rem',
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>

              {feedbackError && (
                <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.82rem' }}>
                  <AlertTriangle size={15} />
                  <span>{feedbackError}</span>
                </div>
              )}

              <button
                id="submit-feedback-btn"
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !decision}
                style={{ width: '100%', background: 'linear-gradient(135deg, #6366f1, #06b6d4)' }}
              >
                {submitting ? (
                  <>
                    <div className="spinner" style={{ width: '0.9rem', height: '0.9rem' }} />
                    Submitting…
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
