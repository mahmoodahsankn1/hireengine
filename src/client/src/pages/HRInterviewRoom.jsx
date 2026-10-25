/**
 * HRInterviewRoom.jsx  – Phase 6
 * Candidate-facing live video interview room.
 * Route: /interview/hr/:token
 *
 * Flow:
 *  1. Waiting room: fetch /api/meetings/<token>/info -> show timing + can_join status
 *  2. On "Join Meeting" tap: POST /api/meetings/<token>/join -> get LiveKit token + server_url
 *  3. Render <LiveKitRoom> with <VideoConference>
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react'
import '@livekit/components-styles'
import api from '../services/api'
import { Video, Clock, ShieldCheck, AlertTriangle } from 'lucide-react'

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatCountdown(targetDate) {
  const diff = Math.max(0, new Date(targetDate) - Date.now())
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1_000)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ─────────────────────────────────────────────────────────────────────────────
// Waiting Room Component (before joining)
// ─────────────────────────────────────────────────────────────────────────────
function WaitingRoom({ info, onJoin, joining, error: joinError }) {
  const [countdown, setCountdown] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (info && !info.can_join && !info.is_expired) {
      setCountdown(formatCountdown(info.join_opens_at))
    }
  }, [info, tick])

  if (!info) return null

  const isTerminal = ['completed', 'no_show', 'cancelled'].includes(info.status)

  return (
    <main className="meeting-waiting-page" id="main-content">
      <section className="meeting-waiting-card">
        <div className="meeting-waiting-heading">
          <div className="meeting-waiting-icon"><Video size={25} aria-hidden="true" /></div>
          <span className="meeting-waiting-kicker">HIREENGINE · ROUND 3</span>
          <h1>Live interview</h1>
          <p className="meeting-waiting-role">{info.job_title}</p>
          <p className="meeting-waiting-company">{info.company_name} <span aria-hidden="true">·</span> {info.candidate_name}</p>
        </div>

        <div className="meeting-waiting-details">
          <div><span>Scheduled for</span><strong>{formatDate(info.start_at)}</strong></div>
          <div><span>Interview length</span><strong>{info.duration_minutes} minutes</strong></div>
          <div><span>Room opens</span><strong>{formatDate(info.join_opens_at)}</strong></div>
          <div><span>Session status</span><strong className={`meeting-waiting-status status-${info.status}`}>{info.status.replaceAll('_', ' ')}</strong></div>
        </div>

        {/* Status / CTA */}
        {isTerminal ? (
          <div className="alert alert-error meeting-waiting-alert">
            <AlertTriangle size={18} />
            <span>
              {info.status === 'no_show' ? 'This interview was marked as no-show.' :
               info.status === 'completed' ? 'This interview has already been completed.' :
               'This interview has been cancelled.'}
            </span>
          </div>
        ) : info.is_expired ? (
          <div className="alert alert-error meeting-waiting-alert">
            <AlertTriangle size={18} />
            <span>The join window has closed. Please contact your recruiter.</span>
          </div>
        ) : info.is_early ? (
          <div className="meeting-waiting-countdown">
            <div className="meeting-countdown-icon"><Clock size={19} /></div>
            <div><span>The meeting room opens in</span><strong>{countdown}</strong></div>
            <p>You can stay on this page. The join button will become available when the room opens.</p>
          </div>
        ) : (
          <>
            {joinError && (
              <div className="alert alert-error meeting-waiting-alert">
                <AlertTriangle size={16} />
                <span>{joinError}</span>
              </div>
            )}
            <button
              id="join-meeting-btn"
              className="btn btn-primary meeting-waiting-join"
              onClick={onJoin}
              disabled={joining}
            >
              {joining ? (
                <>
                  <div className="spinner" style={{ width: '1rem', height: '1rem' }} />
                  Connecting…
                </>
              ) : (
                <>
                  <Video size={18} /> Join Video Interview
                </>
              )}
            </button>
          </>
        )}

        <div className="meeting-waiting-checklist">
          <ShieldCheck size={18} aria-hidden="true" />
          <p><strong>Before you join</strong><br />Choose a quiet place and allow camera and microphone access when prompted.</p>
        </div>
        <p className="meeting-waiting-footnote">Need to reschedule? Contact your recruiter using the invitation email.</p>
      </section>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function HRInterviewRoom() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [infoError, setInfoError] = useState(null)
  const [loadingInfo, setLoadingInfo] = useState(true)

  const [roomData, setRoomData] = useState(null)  // { token, server_url }
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState(null)

  // Poll info until can_join or terminal
  useEffect(() => {
    let cancelled = false
    let interval

    async function fetchInfo() {
      try {
        const res = await api.get(`/meetings/${token}/info/`)
        if (!cancelled) {
          setInfo(res.data)
          setLoadingInfo(false)
          const { can_join, is_expired, status } = res.data
          const terminal = ['completed', 'no_show', 'cancelled'].includes(status)
          if (can_join || is_expired || terminal) {
            clearInterval(interval)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setInfoError(err.response?.data?.error || 'Failed to load interview info.')
          setLoadingInfo(false)
          clearInterval(interval)
        }
      }
    }

    fetchInfo()
    interval = setInterval(fetchInfo, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token])

  const handleJoin = useCallback(async () => {
    setJoining(true)
    setJoinError(null)
    try {
      const res = await api.post(`/meetings/${token}/join/`)
      setRoomData(res.data)
    } catch (err) {
      setJoinError(err.response?.data?.error || 'Failed to join meeting. Please try again.')
    } finally {
      setJoining(false)
    }
  }, [token])

  if (loadingInfo) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg-base)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: '2.5rem', height: '2.5rem', margin: '0 auto 1rem' }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading interview details…</p>
        </div>
      </div>
    )
  }

  if (infoError) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg-base)', padding: '2rem',
      }}>
        <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '2rem', textAlign: 'center' }}>
          <AlertTriangle size={40} color="var(--color-danger)" style={{ margin: '0 auto 1rem' }} />
          <h2>Interview Not Found</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>{infoError}</p>
        </div>
      </div>
    )
  }

  // If we have room credentials, render the LiveKit room
  if (roomData) {
    return (
      <div style={{ height: '100vh', background: '#0f1117' }}>
        <LiveKitRoom
          serverUrl={roomData.server_url}
          token={roomData.token}
          connect={true}
          video={true}
          audio={true}
          style={{ height: '100%' }}
          onError={(err) => {
            console.error('LiveKit connection error:', err)
            setJoinError(`Connection error: ${err?.message || 'Could not connect to the meeting room. Please check your network and try again.'}`)
            setRoomData(null)
          }}
          onDisconnected={() => {
            // Only return to waiting room on intentional disconnect
            // (not on connection failure which is handled by onError)
            setRoomData(null)
          }}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <WaitingRoom
      info={info}
      onJoin={handleJoin}
      joining={joining}
      error={joinError}
    />
  )
}
