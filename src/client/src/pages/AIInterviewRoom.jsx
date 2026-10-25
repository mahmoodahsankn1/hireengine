import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  Mic, Volume2, Shield, Clock, AlertTriangle,
  CheckCircle, Sparkles, PhoneOff, Smartphone
} from 'lucide-react'
import api from '../services/api'

export default function AIInterviewRoom() {
  const { token } = useParams()

  // States: 'loading' | 'waiting' | 'in_interview' | 'completed' | 'expired' | 'error'
  const [viewState, setViewState] = useState('loading')
  const [interviewInfo, setInterviewInfo] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Waiting room mic test state
  const [micTested, setMicTested] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [micTesting, setMicTesting] = useState(false)
  const [micError, setMicError] = useState('')

  // Interview state
  const [secondsRemaining, setSecondsRemaining] = useState(300)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [userSpeaking, setUserSpeaking] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isMockMode, setIsMockMode] = useState(false)
  const [audioBlocked, setAudioBlocked] = useState(false)

  // Refs
  const audioStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animationFrameRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const dataChannelRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const transcriptRef = useRef([])
  const timerIntervalRef = useRef(null)
  const sessionStartedAtRef = useRef(null)
  const candidateSpeechStartedAtRef = useRef(null)
  const candidateSpeechDurationMsRef = useRef(0)
  const manualInputStartedAtRef = useRef(null)

  function appendTranscriptTurn(turn) {
    const updatedTranscript = [...transcriptRef.current, turn]
    transcriptRef.current = updatedTranscript
  }

  function buildTranscriptPayload(turns = transcriptRef.current) {
    const endedAt = new Date()
    const startedAt = sessionStartedAtRef.current
    return {
      turns,
      total_duration_seconds: startedAt
        ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000))
        : 0,
      started_at: startedAt?.toISOString() || null,
      ended_at: endedAt.toISOString(),
    }
  }

  // 1. Fetch Interview info
  useEffect(() => {
    async function fetchInfo() {
      try {
        const res = await api.get(`/ai-interview/${token}/info/`)
        const data = res.data
        setInterviewInfo(data)

        if (data.status === 'completed') {
          setViewState('completed')
        } else if (data.status === 'no_show' || data.is_expired) {
          setViewState('expired')
        } else if (data.status === 'in_progress') {
          // Reconnect scenario
          setViewState('waiting')
        } else {
          setViewState('waiting')
        }
      } catch (err) {
        setErrorMessage(err.response?.data?.error || 'Interview session not found or link has expired.')
        setViewState('error')
      }
    }
    fetchInfo()

    return () => {
      cleanupAudio()
    }
  }, [token])

  // 2. Microphone Test in Waiting Room
  async function testMicrophone() {
    setMicError('')
    setMicTesting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      audioContextRef.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyserRef.current = analyser
      analyser.fftSize = 256

      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      
      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        setAudioLevel(Math.min(100, Math.round(avg * 1.5)))

        if (avg > 10) {
          setMicTested(true)
        }
        animationFrameRef.current = requestAnimationFrame(checkLevel)
      }
      checkLevel()
    } catch (err) {
      setMicError('Microphone access denied. Please grant microphone permissions in your browser to continue.')
      setMicTesting(false)
    }
  }

  function cleanupAudio() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop())
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
    }
  }

  // 3. Start AI Interview Session
  async function startInterview() {
    transcriptRef.current = []
    sessionStartedAtRef.current = null
    candidateSpeechStartedAtRef.current = null
    candidateSpeechDurationMsRef.current = 0
    manualInputStartedAtRef.current = null
    setViewState('in_interview')
    setIsSubmitting(false)

    // Pre-activate / warm up audio element on direct user gesture for mobile browsers
    if (remoteAudioRef.current) {
      remoteAudioRef.current.play().catch(() => {})
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {})
    }

    try {
      // Obtain mic stream if not already active
      let stream = audioStreamRef.current
      if (!stream || !stream.active) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioStreamRef.current = stream
      }

      // Call Backend to mint Realtime session key
      const startRes = await api.post(`/ai-interview/${token}/start/`)
      const { key, ends_at, is_mock, started_at } = startRes.data

      setIsMockMode(Boolean(is_mock))
      sessionStartedAtRef.current = new Date(started_at || Date.now())
      setElapsedSeconds(0)

      // Setup countdown timer based on server ends_at
      const endMs = new Date(ends_at).getTime()
      const nowMs = Date.now()
      const remainingSecs = Math.max(10, Math.round((endMs - nowMs) / 1000))
      setSecondsRemaining(remainingSecs)

      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - sessionStartedAtRef.current.getTime()) / 1000))
        setSecondsRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            handleFinishInterview()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      // Setup pagehide beacon for safety
      const handlePageHide = () => {
        const beaconUrl = `${api.defaults.baseURL || '/api'}/ai-interview/${token}/finish/`
        const payload = JSON.stringify({ transcript: buildTranscriptPayload() })
        navigator.sendBeacon(beaconUrl, new Blob([payload], { type: 'application/json' }))
      }
      window.addEventListener('pagehide', handlePageHide)

      // Setup WebRTC connection
      await setupWebRTC(key, stream, is_mock)

    } catch (err) {
      alert(err.response?.data?.error || 'Failed to initialize AI interview connection.')
      setViewState('waiting')
    }
  }

  // 4. Setup OpenAI Realtime WebRTC connection
  async function setupWebRTC(ephemeralKey, micStream, isMock) {
    if (isMock) {
      setupMockInterview()
      return
    }

    try {
      const pc = new RTCPeerConnection()
      peerConnectionRef.current = pc

      // Play audio from OpenAI Assistant
      pc.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0]
          remoteAudioRef.current.play().then(() => {
            setAudioBlocked(false)
          }).catch(e => {
            console.warn('Audio auto-play blocked by browser policy:', e)
            setAudioBlocked(true)
          })
        }
        setAiSpeaking(true)
      }

      // Add local candidate audio track
      micStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, micStream)
      })

      // Setup data channel for events and transcripts
      const dc = pc.createDataChannel('oai-events')
      dataChannelRef.current = dc

      dc.onopen = () => {
        // Send initial trigger to greet candidate
        const initialGreet = {
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: 'Greet the candidate warmly, state your role as HireEngine AI Interviewer, and ask the first technical question based on the job requirements.'
          }
        }
        dc.send(JSON.stringify(initialGreet))
      }

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          
          // User finished speaking / input transcription
          if (msg.type === 'conversation.item.input_audio_transcription.completed') {
            const userText = msg.transcript?.trim()
            if (userText) {
              if (candidateSpeechStartedAtRef.current !== null) {
                candidateSpeechDurationMsRef.current += Date.now() - candidateSpeechStartedAtRef.current
                candidateSpeechStartedAtRef.current = null
              }
              const responseDurationSeconds = Math.round(candidateSpeechDurationMsRef.current / 1000)
              candidateSpeechDurationMsRef.current = 0
              appendTranscriptTurn({
                speaker: 'user',
                text: userText,
                time: new Date().toISOString(),
                response_duration_seconds: responseDurationSeconds,
              })
              setUserSpeaking(false)
            }
          }

          // AI assistant audio transcript done (support GA and preview event shapes)
          if (
            msg.type === 'response.audio_transcript.done' ||
            msg.type === 'response.output_audio_transcript.done' ||
            msg.type === 'response.output_text.done'
          ) {
            const aiText = (msg.transcript || msg.text || '')?.trim()
            if (aiText) {
              appendTranscriptTurn({ speaker: 'assistant', text: aiText, time: new Date().toISOString() })
              setAiSpeaking(false)
            }
          }

          if (msg.type === 'input_audio_buffer.speech_started') {
            if (candidateSpeechStartedAtRef.current === null) {
              candidateSpeechStartedAtRef.current = Date.now()
            }
            setUserSpeaking(true)
          }
          if (msg.type === 'input_audio_buffer.speech_stopped') {
            if (candidateSpeechStartedAtRef.current !== null) {
              candidateSpeechDurationMsRef.current += Date.now() - candidateSpeechStartedAtRef.current
              candidateSpeechStartedAtRef.current = null
            }
            setUserSpeaking(false)
          }
        } catch (e) {
          // ignore non-json events
        }
      }

      // Create local SDP offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Post offer to OpenAI Realtime WebRTC GA endpoint (/v1/realtime/calls)
      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          'Authorization': `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp'
        }
      })

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text().catch(() => '')
        throw new Error(`OpenAI Realtime WebRTC returned status ${sdpResponse.status}: ${errText}`)
      }

      const answerSdp = await sdpResponse.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    } catch (webrtcErr) {
      console.warn('WebRTC connection to OpenAI could not be established; starting fallback mode:', webrtcErr)
      setupMockInterview()
    }
  }

  // Fallback simulator for development/testing without active paid OpenAI Realtime balance
  function setupMockInterview() {
    setIsMockMode(true)
    
    // Initial welcome turn
    const welcomeTurn = {
      speaker: 'assistant',
      text: `Hello ${interviewInfo?.candidate_name || 'Candidate'}! Welcome to your technical interview for ${interviewInfo?.job_title || 'the position'}. Could you briefly describe your technical background and experience with the core skills listed for this role?`,
      time: new Date().toISOString()
    }
    transcriptRef.current = [welcomeTurn]

    // Speak welcome using browser speech if available
    speakText(welcomeTurn.text)
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = 1.0
      window.speechSynthesis.speak(utter)
    } catch (e) {
      console.warn('Speech synthesis error:', e)
    }
  }

  // Candidate adds manual response or speech turn in fallback mode
  const [manualInput, setManualInput] = useState('')
  function handleSendManualTurn() {
    if (!manualInput.trim()) return
    const userTurn = {
      speaker: 'user',
      text: manualInput.trim(),
      time: new Date().toISOString(),
      response_duration_seconds: manualInputStartedAtRef.current
        ? Math.round((Date.now() - manualInputStartedAtRef.current) / 1000)
        : 0,
    }
    appendTranscriptTurn(userTurn)
    setManualInput('')
    manualInputStartedAtRef.current = null

    // Generate responsive follow-up turn in mock mode
    setTimeout(() => {
      const followUps = [
        "That is very clear. Can you describe how you approach debugging high-concurrency issues or state race conditions in production?",
        "Thank you. In your experience, what are the primary architectural trade-offs when designing asynchronous event queues versus synchronous APIs?",
        "Great insights. How do you ensure code quality, automated testing, and security compliance throughout your development lifecycle?"
      ]
      const nextQ = followUps[Math.min(followUps.length - 1, Math.floor(Math.random() * followUps.length))]
      const aiTurn = {
        speaker: 'assistant',
        text: nextQ,
        time: new Date().toISOString()
      }
      appendTranscriptTurn(aiTurn)
      speakText(nextQ)
    }, 1200)
  }

  // 5. Finish Interview & Submit Transcript
  async function handleFinishInterview() {
    if (isSubmitting) return
    setIsSubmitting(true)

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
    }

    cleanupAudio()

    const currentTranscript = transcriptRef.current || []

    try {
      await api.post(`/ai-interview/${token}/finish/`, {
        transcript: buildTranscriptPayload(currentTranscript)
      })
      setViewState('completed')
    } catch (err) {
      console.error('Error finishing interview:', err)
      // Even if call fails, move to completed state since candidate has concluded
      setViewState('completed')
    }
  }

  // Format MM:SS
  const mins = Math.floor(secondsRemaining / 60)
  const secs = secondsRemaining % 60
  const formattedTime = `${mins}:${secs < 10 ? '0' : ''}${secs}`
  const elapsedMins = Math.floor(elapsedSeconds / 60)
  const elapsedRemainder = elapsedSeconds % 60
  const formattedElapsed = `${elapsedMins}:${elapsedRemainder < 10 ? '0' : ''}${elapsedRemainder}`

  // Render Waiting Room
  if (viewState === 'waiting') {
    const startAtDate = interviewInfo?.start_at ? new Date(interviewInfo.start_at) : null
    const canStart = interviewInfo?.can_start

    return (
      <div className="page" style={{ maxWidth: '780px', margin: '0 auto', paddingTop: '2.5rem' }}>
        <div className="card" style={{ padding: '2.5rem', boxShadow: 'var(--shadow-card)' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span className="badge badge-accent" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
              <Sparkles size={14} aria-hidden="true" />
              AI Technical Voice Interview
            </span>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
              {interviewInfo?.job_title}
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              {interviewInfo?.company_name} • Candidate: <strong>{interviewInfo?.candidate_name}</strong>
            </p>
          </div>

          {/* Timing details */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', 
            gap: '1rem',
            marginBottom: '2rem',
            background: 'var(--bg-surface)',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Scheduled Time</span>
              <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>
                {startAtDate ? startAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ready'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Duration</span>
              <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>
                {interviewInfo?.duration_minutes || 5} Minutes Max
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</span>
              <div style={{ fontWeight: 600, marginTop: '0.2rem', color: 'var(--color-success)' }}>
                Waiting Room Open
              </div>
            </div>
          </div>

          {/* Microphone Check Box */}
          <div className="card" style={{ 
            background: 'var(--bg-input)', 
            padding: '1.5rem', 
            borderRadius: 'var(--radius-md)',
            marginBottom: '2rem',
            border: micTested ? '1px solid var(--color-success)' : '1px solid var(--border-subtle)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mic size={18} color={micTested ? 'var(--color-success)' : 'var(--color-primary-light)'} />
                <h3 style={{ fontSize: '1rem' }}>Microphone & Audio Check</h3>
              </div>
              {micTested && (
                <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                  <CheckCircle size={14} aria-hidden="true" />
                  Mic Ready
                </span>
              )}
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Ensure your microphone is functioning. The AI interviewer interacts via spoken voice in real time.
            </p>

            {micError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <AlertTriangle size={15} /> {micError}
              </div>
            )}

            {!micTested && !micTesting && (
              <button className="btn btn-secondary" onClick={testMicrophone} style={{ width: '100%', justifyContent: 'center' }}>
                <Mic size={16} /> Test Microphone
              </button>
            )}

            {micTesting && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  <span>Speak into your mic to test...</span>
                  <span>{audioLevel}%</span>
                </div>
                <div style={{ width: '100%', height: '10px', background: 'var(--bg-card)', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: `${audioLevel}%`, 
                    background: audioLevel > 20 ? 'var(--color-success)' : 'var(--color-accent)',
                    transition: 'width 0.1s ease'
                  }} />
                </div>
                {micTested && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-success)', marginTop: '0.6rem' }}>
                    <CheckCircle size={14} aria-hidden="true" />
                    Voice detected! Your microphone is working properly.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Rules & Transparency */}
          <div style={{ marginBottom: '2rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Shield size={16} color="var(--color-primary-light)" /> Rules & Expectations
            </h4>
            <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', lineHeight: 1.6 }}>
              <li>The interview will strictly last up to {interviewInfo?.duration_minutes || 5} minutes with an automatic countdown.</li>
              <li>Questions focus exclusively on technical and domain requirements for this position.</li>
              <li>Your spoken answers are transcribed and evaluated by an automated scoring model.</li>
              <li>All AI scores are advisory; final hiring decisions are always made by the human HR team.</li>
              <li>Learn more about our data handling in the <Link to="/privacy" target="_blank" style={{ textDecoration: 'underline' }}>Privacy Policy</Link>.</li>
            </ul>
          </div>

          {/* Action Button */}
          <div>
            <button 
              id="start-ai-interview-btn"
              className="btn btn-primary" 
              style={{ width: '100%', padding: '0.85rem', fontSize: '1.05rem', justifyContent: 'center' }}
              disabled={!canStart}
              onClick={startInterview}
            >
              <Sparkles size={18} />
              {canStart ? 'Start AI Interview' : 'Waiting for Scheduled Start Time...'}
            </button>
            {!canStart && interviewInfo?.is_early && (
              <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                The start button will become available at your scheduled interview time.
              </p>
            )}
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
              <Smartphone size={14} aria-hidden="true" />
              <strong>Mobile note:</strong> Make sure your device is not on Silent Mode (turn off physical mute switch on iPhone) and media volume is turned up.
            </p>
          </div>
        </div>
        {/* Persistent audio element for iOS/mobile activation */}
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      </div>
    )
  }

  // Render Active Interview Room
  if (viewState === 'in_interview') {
    const totalSeconds = (interviewInfo?.duration_minutes || 5) * 60
    const elapsedPercent = Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100))

    return (
      <main className="ai-room-page" id="main-content">
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

        <header className="ai-room-header">
          <div>
            <h1>{interviewInfo?.job_title}</h1>
            <p>{interviewInfo?.company_name} <span aria-hidden="true">·</span> {interviewInfo?.candidate_name}</p>
          </div>
          <div className="ai-room-live-badge"><span /> Session in progress</div>
        </header>

        {audioBlocked && (
          <div className="ai-room-audio-alert" role="alert">
            <p>Audio playback was blocked by your browser. Enable audio to hear the interviewer.</p>
            <button
              onClick={() => {
                if (remoteAudioRef.current) {
                  remoteAudioRef.current.play().then(() => setAudioBlocked(false)).catch(e => console.warn(e))
                }
              }}
              className="btn btn-primary"
            >
              <Volume2 size={16} /> Enable audio
            </button>
          </div>
        )}

        <section className="ai-room-stage" aria-label="Live interview controls">
          <div className="ai-room-stage-meta">
            <span><Sparkles size={15} /> HireEngine AI interviewer</span>
            {isMockMode && <span className="ai-room-mode">Text fallback</span>}
          </div>

          <div className={`ai-room-orb ${aiSpeaking ? 'is-speaking' : ''} ${userSpeaking ? 'is-listening' : ''}`}>
            <div className="ai-room-orb-core"><Volume2 size={36} aria-hidden="true" /></div>
          </div>
          <h2>AI Technical Interview</h2>
          <p className="ai-room-speaking-state" aria-live="polite">
            {aiSpeaking ? 'Interviewer is speaking' : userSpeaking ? 'Listening to your answer' : 'Ready when you are'}
          </p>
          <div className={`ai-room-waveform ${aiSpeaking || userSpeaking ? 'is-active' : ''}`} aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => <span key={i} />)}
          </div>
          <p className="ai-room-prompt">
            Speak naturally and take a moment to explain your approach. Your answers are captured for the hiring team and AI evaluation.
          </p>

          <div className="ai-room-timing">
            <div className="ai-room-time-stat">
              <span>Elapsed</span>
              <strong><Clock size={16} /> {formattedElapsed}</strong>
            </div>
            <div className="ai-room-progress" role="progressbar" aria-label="Interview time elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsedPercent)}>
              <span style={{ width: `${elapsedPercent}%` }} />
            </div>
            <div className={`ai-room-time-stat ai-room-time-remaining ${secondsRemaining < 60 ? 'is-ending' : ''}`}>
              <span>Time remaining</span>
              <strong><Clock size={16} /> {formattedTime}</strong>
            </div>
          </div>
        </section>

        <div className="ai-room-privacy-note">
          <Shield size={18} aria-hidden="true" />
          <p><strong>Private interview session</strong><br />Live transcript is hidden from this screen and securely submitted for evaluation when you finish.</p>
        </div>

        {isMockMode && (
          <form className="ai-room-fallback" onSubmit={e => { e.preventDefault(); handleSendManualTurn() }}>
            <label htmlFor="ai-room-response">Text response (audio interview is unavailable)</label>
            <div>
              <input
                id="ai-room-response"
                type="text"
                className="input"
                placeholder="Type your response..."
                value={manualInput}
                onChange={e => {
                  if (!e.target.value) {
                    manualInputStartedAtRef.current = null
                  } else if (manualInputStartedAtRef.current === null) {
                    manualInputStartedAtRef.current = Date.now()
                  }
                  setManualInput(e.target.value)
                }}
              />
              <button className="btn btn-primary" type="submit" disabled={!manualInput.trim()}>Send response</button>
            </div>
          </form>
        )}

        <footer className="ai-room-footer">
          <span><Shield size={14} /> Securely recorded for this interview</span>
          <button
            id="end-ai-interview-btn"
            className="btn ai-room-end-button"
            disabled={isSubmitting}
            onClick={handleFinishInterview}
          >
            <PhoneOff size={16} /> {isSubmitting ? 'Submitting...' : 'End interview'}
          </button>
        </footer>
      </main>
    )
  }

  // Render Completed State
  if (viewState === 'completed') {
    return (
      <div className="page" style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
        <div className="card" style={{ padding: '3rem 2rem', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ 
            width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)',
            color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <CheckCircle size={40} />
          </div>

          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>
            Interview Submitted Successfully!
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Thank you for completing your AI technical voice interview. Your spoken responses and transcript have been safely stored and submitted for evaluation.
          </p>

          <div style={{ 
            background: 'var(--bg-surface)', 
            padding: '1.25rem', 
            borderRadius: 'var(--radius-md)', 
            textAlign: 'left',
            marginBottom: '2rem',
            border: '1px solid var(--border-subtle)'
          }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.4rem', color: 'var(--text-primary)' }}>What happens next?</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              The hiring team will review your CV score and interview evaluation. Qualified candidates will receive an invitation for Round 3 live interviews via email.
            </p>
          </div>

          <Link to="/privacy" className="btn btn-secondary" style={{ display: 'inline-flex', fontSize: '0.85rem' }}>
            View Privacy & Data Retention Policy
          </Link>
        </div>
      </div>
    )
  }

  // Render Expired State
  if (viewState === 'expired') {
    return (
      <div className="page" style={{ maxWidth: '540px', margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
        <div className="card" style={{ padding: '3rem 2rem' }}>
          <div style={{ color: 'var(--color-warning)', marginBottom: '1rem' }}>
            <AlertTriangle size={48} style={{ margin: '0 auto' }} />
          </div>
          <h2 style={{ marginBottom: '0.5rem' }}>Join Window Expired</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            The join grace window for this scheduled interview has passed. This session has been recorded as a no-show.
          </p>
          <Link to="/privacy" className="btn btn-secondary">
            Privacy Policy
          </Link>
        </div>
      </div>
    )
  }

  // Error State
  return (
    <div className="page" style={{ maxWidth: '540px', margin: '0 auto', paddingTop: '4rem', textAlign: 'center' }}>
      <div className="card" style={{ padding: '3rem 2rem' }}>
        <div style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto' }} />
        </div>
        <h2 style={{ marginBottom: '0.5rem' }}>Unable to Access Session</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          {errorMessage || 'The requested interview session token is invalid or has expired.'}
        </p>
      </div>
    </div>
  )
}
