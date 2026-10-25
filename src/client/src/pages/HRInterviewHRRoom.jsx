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
  Video, FileText, ChevronRight, CheckCircle, XCircle, AlertTriangle, X, User,
  Clock, ShieldCheck,
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

  const [interviewInfo, setInterviewInfo] = useState(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [infoError, setInfoError] = useState(null)
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
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    api.get(`/interviews/${interviewId}/`)
      .then(res => {
        if (!cancelled) {
          setInterviewInfo(res.data)
          if (res.data.feedback) {
            setFeedbackDone(true)
            setDecision(res.data.feedback.decision)
            setRating(String(res.data.feedback.rating || ''))
            setNotes(res.data.feedback.notes || '')
          }
        }
      })
      .catch(err => {
        if (!cancelled) setInfoError(err.response?.data?.error || 'Could not load interview details.')
      })
      .finally(() => {
        if (!cancelled) setLoadingInfo(false)
      })
    return () => { cancelled = true }
  }, [interviewId])

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const join = useCallback(async () => {
    setJoining(true)
    setJoinError(null)
    try {
      const res = await api.post(`/interviews/${interviewId}/join/`)
      setRoomData(res.data)
    } catch (err) {
      setJoinError(err.response?.data?.error || 'Failed to join interview room.')
    } finally {
      setJoining(false)
    }
  }, [interviewId])

  async function handleSubmitFeedback(e) {
    e.preventDefault()
    if (!decision) {
      setFeedbackError('Please select a decision before submitting.')
      return
    }
    if (!rating) {
      setFeedbackError('Please select an interview rating from 1 to 10.')
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

  if (loadingInfo) {
    return <div className="hr-meeting-entry"><div className="hr-meeting-entry-card"><span className="spinner" /><p>Loading interview details…</p></div></div>
  }

  if (infoError) {
    return (
      <div className="hr-meeting-entry">
        <div className="hr-meeting-entry-card">
          <AlertTriangle size={38} className="hr-meeting-entry-error-icon" />
          <h1>Interview unavailable</h1>
          <p>{infoError}</p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>Back to job</button>
        </div>
      </div>
    )
  }

  if (!roomData && interviewInfo?.feedback) {
    return (
      <div className="hr-meeting-entry">
        <div className="hr-meeting-entry-card">
          <CheckCircle size={42} className="hr-meeting-entry-success-icon" />
          <span className="hr-meeting-entry-kicker">INTERVIEW COMPLETE</span>
          <h1>Feedback already submitted</h1>
          <p>{interviewInfo.candidate_name} · {interviewInfo.job_title}</p>
          <div className="hr-meeting-feedback-receipt">
            <strong>{interviewInfo.feedback.rating}/10</strong>
            <span>{interviewInfo.feedback.decision === 'selected' ? 'Recommended to advance' : 'Not recommended to advance'}</span>
            {interviewInfo.feedback.notes && <p>{interviewInfo.feedback.notes}</p>}
          </div>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>Back to job</button>
        </div>
      </div>
    )
  }

  if (!roomData) {
    const joinOpensAt = interviewInfo?.join_opens_at ? new Date(interviewInfo.join_opens_at) : null
    const isEarly = joinOpensAt && currentTime < joinOpensAt
    return (
      <main className="hr-meeting-entry" id="main-content">
        <section className="hr-meeting-entry-card">
          <div className="hr-meeting-entry-icon"><Video size={26} /></div>
          <span className="hr-meeting-entry-kicker">HIREENGINE · RECRUITER ROOM</span>
          <h1>Prepare for your interview</h1>
          <p className="hr-meeting-entry-candidate">{interviewInfo?.candidate_name}</p>
          <p>{interviewInfo?.job_title} · {interviewInfo?.company_name}</p>
          <div className="hr-meeting-entry-details">
            <div><span>Scheduled</span><strong>{new Date(interviewInfo.start_at).toLocaleString()}</strong></div>
            <div><span>Duration</span><strong>{interviewInfo.duration_minutes} minutes</strong></div>
            <div><span>Room opens</span><strong>{joinOpensAt?.toLocaleString() || 'Now'}</strong></div>
            <div><span>Status</span><strong>{interviewInfo.status.replaceAll('_', ' ')}</strong></div>
          </div>
          {joinError && <div className="alert alert-error hr-meeting-join-error" role="alert"><AlertTriangle size={16} />{joinError}</div>}
          {isEarly ? (
            <div className="hr-meeting-early-note"><Clock size={18} /><span>The room is not open yet. You can join when the scheduled early-access time begins.</span></div>
          ) : (
            <button className="btn btn-primary hr-meeting-join-button" onClick={join} disabled={joining}>
              {joining ? <><span className="spinner" /> Connecting…</> : <><Video size={17} /> Join live interview</>}
            </button>
          )}
          <div className="hr-meeting-entry-note"><ShieldCheck size={17} /><span>Your interview notes and rating are saved to this candidate’s evaluation.</span></div>
          <button className="btn btn-ghost hr-meeting-entry-back" onClick={() => navigate(-1)}>Back to job</button>
        </section>
      </main>
    )
  }

  if (!roomData) return null

  const ctx = roomData  // { token, server_url, candidate_name, cv_score, ai_score, resume_url, ... }

  return (
    <main className="hr-meeting-shell" id="main-content">
      <header className="hr-meeting-toolbar">
        <div>
          <span>LIVE INTERVIEW · ROUND 3</span>
          <strong>{ctx.candidate_name}</strong>
          <small>{interviewInfo?.job_title || 'Candidate interview'}</small>
        </div>
        <button
          id="toggle-side-panel-btn"
          className="hr-meeting-panel-toggle"
          onClick={() => setShowFeedbackPanel(v => !v)}
          aria-expanded={showFeedbackPanel}
          aria-controls="hr-meeting-feedback-panel"
        >
          {showFeedbackPanel ? <X size={17} /> : <User size={17} />}
          {showFeedbackPanel ? 'Hide evaluation' : 'Evaluation & rating'}
        </button>
      </header>
      <div className="hr-meeting-layout">
      {/* ── LiveKit Room (left / main) ── */}
      <section className="hr-meeting-video">
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
          }}
          onDisconnected={() => setRoomData(null)}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </section>

      {/* Mobile backdrop overlay */}
      {showFeedbackPanel && (
        <div
          className="hr-meeting-drawer-overlay"
          onClick={() => setShowFeedbackPanel(false)}
        />
      )}

      {/* ── HR Side Panel (right) ── */}
      <aside id="hr-meeting-feedback-panel" className={`hr-side-panel ${showFeedbackPanel ? 'is-open' : ''}`}>
        <div className="hr-side-panel-inner">
          {/* Header */}
          <div className="hr-side-panel-heading">
            <div>
              <span className="hr-panel-eyebrow">CANDIDATE EVALUATION</span>
              <h3>
                {ctx.candidate_name}
              </h3>
              <p>{ctx.candidate_email}</p>
            </div>
            <button
              onClick={() => setShowFeedbackPanel(false)}
              className="hr-panel-close"
              aria-label="Close evaluation panel"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scores */}
          <div className="hr-panel-score-section">
            <p>Existing screening scores</p>
            <div>
              <ScorePill label="CV Score" value={ctx.cv_score} max={100} color="#06b6d4" />
              <ScorePill label="AI Interview" value={ctx.ai_score} max={100} color="var(--mint-ink)" />
            </div>
          </div>

          {/* Resume link */}
          {ctx.resume_url && (
            <a
              id="resume-link"
              href={ctx.resume_url}
              target="_blank"
              rel="noreferrer"
              className="hr-panel-resume-link"
            >
              <FileText size={16} /> View Resume <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
            </a>
          )}

          <div className="hr-panel-divider" />

          {/* Feedback Form */}
          {feedbackDone ? (
            <div className="hr-feedback-success">
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
              <div className="hr-feedback-title"><span>YOUR EVALUATION</span><h4>Interview feedback</h4><p>Rate the interview and record your hiring recommendation.</p></div>

              {/* Decision */}
              <div style={{ marginBottom: '1rem' }}>
                <label className="hr-feedback-label">
                  Decision <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div className="hr-decision-grid">
                  <button
                    type="button"
                    id="decision-selected"
                    onClick={() => setDecision('selected')}
                    className={`hr-decision-button ${decision === 'selected' ? 'is-selected' : ''}`}
                    aria-pressed={decision === 'selected'}
                  >
                    <CheckCircle size={15} /> Select
                  </button>
                  <button
                    type="button"
                    id="decision-rejected"
                    onClick={() => setDecision('rejected')}
                    className={`hr-decision-button reject ${decision === 'rejected' ? 'is-selected' : ''}`}
                    aria-pressed={decision === 'rejected'}
                  >
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              </div>

              {/* Rating */}
              <div style={{ marginBottom: '1rem' }}>
                <label className="hr-feedback-label">
                  Interview rating <span>Required · 1–10</span>
                </label>
                <div className="hr-rating-grid" role="radiogroup" aria-label="Interview rating, from 1 to 10">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button
                      key={n}
                      type="button"
                      id={`rating-${n}`}
                      onClick={() => setRating(String(n))}
                      className={`hr-rating-option ${rating === String(n) ? 'is-selected' : ''}`}
                      role="radio"
                      aria-checked={rating === String(n)}
                      aria-label={`Rate ${n} out of 10`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label htmlFor="feedback-notes" className="hr-feedback-label">
                  Interview notes <span>Optional</span>
                </label>
                <textarea
                  id="feedback-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Key observations, strengths, areas of concern…"
                  rows={4}
                  className="hr-feedback-notes"
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
                disabled={submitting || !decision || !rating}
                className="btn btn-primary hr-feedback-submit"
              >
                {submitting ? (
                  <>
                    <div className="spinner" style={{ width: '0.9rem', height: '0.9rem' }} />
                    Submitting…
                  </>
                ) : (
                  <>Save interview rating <CheckCircle size={16} /></>
                )}
              </button>
            </form>
          )}
        </div>
      </aside>
      </div>
    </main>
  )
}
