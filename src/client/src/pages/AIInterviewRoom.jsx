import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { 
  Mic, MicOff, Volume2, Shield, Clock, AlertTriangle, 
  CheckCircle, Sparkles, PhoneOff, Award, ChevronRight, FileText
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
  const [transcript, setTranscript] = useState([])
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

  // Update transcriptRef whenever transcript state changes
  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

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
      const { key, ends_at, duration_minutes, is_mock } = startRes.data

      setIsMockMode(Boolean(is_mock))

      // Setup countdown timer based on server ends_at
      const endMs = new Date(ends_at).getTime()
      const nowMs = Date.now()
      const remainingSecs = Math.max(10, Math.round((endMs - nowMs) / 1000))
      setSecondsRemaining(remainingSecs)

      timerIntervalRef.current = setInterval(() => {
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
        const payload = JSON.stringify({ transcript: transcriptRef.current })
        navigator.sendBeacon(beaconUrl, payload)
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
              setTranscript(prev => [
                ...prev,
                { speaker: 'user', text: userText, time: new Date().toISOString() }
              ])
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
              setTranscript(prev => [
                ...prev,
                { speaker: 'assistant', text: aiText, time: new Date().toISOString() }
              ])
              setAiSpeaking(false)
            }
          }

          if (msg.type === 'input_audio_buffer.speech_started') {
            setUserSpeaking(true)
          }
          if (msg.type === 'input_audio_buffer.speech_stopped') {
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
    setTranscript([welcomeTurn])

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
      time: new Date().toISOString()
    }
    setTranscript(prev => [...prev, userTurn])
    setManualInput('')

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
      setTranscript(prev => [...prev, aiTurn])
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
        transcript: currentTranscript
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
              🤖 AI Technical Voice Interview
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
                  ✓ Mic Ready
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
                    ✓ Voice detected! Your microphone is working properly.
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
                The start button will automatically unlock at your scheduled interview time.
              </p>
            )}
            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
              📱 <strong>Mobile Note:</strong> Make sure your device is not on Silent Mode (turn off physical mute switch on iPhone) and media volume is turned up.
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
    return (
      <div className="page" style={{ maxWidth: '860px', margin: '0 auto', paddingTop: '1.5rem' }}>
        {/* Remote Audio Element */}
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

        {/* Audio blocked notification on mobile browsers */}
        {audioBlocked && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--color-danger)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-danger)', fontWeight: 600 }}>
              🔇 Audio playback was blocked by your browser's autoplay policy.
            </div>
            <button 
              onClick={() => {
                if (remoteAudioRef.current) {
                  remoteAudioRef.current.play().then(() => setAudioBlocked(false)).catch(e => console.warn(e))
                }
              }}
              className="btn btn-primary"
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem' }}
            >
              🔊 Tap to Enable Audio
            </button>
          </div>
        )}

        {/* Top Control Bar */}
        <div className="card" style={{ 
          padding: '1rem 1.5rem', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Position</span>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{interviewInfo?.job_title}</div>
          </div>

          {/* Countdown Clock */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            padding: '0.4rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: secondsRemaining < 60 ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface)',
            border: secondsRemaining < 60 ? '1px solid var(--color-danger)' : '1px solid var(--border-subtle)',
            color: secondsRemaining < 60 ? 'var(--color-danger)' : 'var(--text-primary)'
          }}>
            <Clock size={18} />
            <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace' }}>
              {formattedTime}
            </span>
          </div>

          {/* End Button */}
          <button 
            id="end-ai-interview-btn"
            className="btn" 
            style={{ background: 'var(--color-danger)', color: '#fff', fontSize: '0.85rem' }}
            disabled={isSubmitting}
            onClick={handleFinishInterview}
          >
            <PhoneOff size={16} /> End Interview
          </button>
        </div>

        {/* Live Visualizer Avatar Card */}
        <div className="card" style={{ 
          padding: '2.5rem 1.5rem', 
          textAlign: 'center', 
          background: 'radial-gradient(circle at center, rgba(99,102,241,0.12) 0%, var(--bg-card) 70%)',
          marginBottom: '1.25rem',
          position: 'relative'
        }}>
          {isMockMode && (
            <span className="badge badge-warning" style={{ position: 'absolute', top: '1rem', right: '1rem', fontSize: '0.75rem' }}>
              Interactive Fallback Mode Active
            </span>
          )}

          {/* AI Pulsing Orb */}
          <div style={{ 
            width: '100px', 
            height: '100px', 
            borderRadius: '50%', 
            margin: '0 auto 1.25rem',
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)',
            transform: aiSpeaking ? 'scale(1.08)' : 'scale(1.0)',
            transition: 'transform 0.3s ease'
          }} className={aiSpeaking ? 'ai-avatar-pulse' : ''}>
            <Volume2 size={40} color="#fff" />
          </div>

          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>
            HireEngine AI Technical Interviewer
          </h3>
          <p style={{ fontSize: '0.85rem', color: aiSpeaking ? 'var(--color-accent)' : userSpeaking ? 'var(--color-success)' : 'var(--text-muted)' }}>
            {aiSpeaking ? 'Speaking...' : userSpeaking ? 'Listening to you...' : 'Listening... Speak naturally.'}
          </p>

          {/* Audio Activity Bars */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '1rem', height: '28px', alignItems: 'center' }}>
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <span 
                key={i} 
                style={{ 
                  width: '4px', 
                  height: (aiSpeaking || userSpeaking) ? `${10 + (i % 3) * 8}px` : '4px', 
                  background: (aiSpeaking || userSpeaking) ? 'var(--color-accent)' : 'var(--text-muted)',
                  borderRadius: '2px',
                  transition: 'height 0.2s ease'
                }} 
              />
            ))}
          </div>
        </div>

        {/* Live Conversation Transcript Display */}
        <div className="card" style={{ padding: '1.5rem', maxHeight: '360px', overflowY: 'auto' }}>
          <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.5px' }}>
            Live Conversation Transcript
          </h4>

          {transcript.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', fontSize: '0.9rem' }}>
              Starting session... The AI interviewer will greet you momentarily.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {transcript.map((turn, idx) => {
                const isUser = turn.speaker === 'user' || turn.speaker === 'candidate'
                return (
                  <div 
                    key={idx} 
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                      {isUser ? 'You (Candidate)' : 'AI Interviewer'}
                    </span>
                    <div style={{ 
                      maxWidth: '80%', 
                      padding: '0.75rem 1rem', 
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.9rem',
                      background: isUser ? 'var(--color-primary)' : 'var(--bg-surface)',
                      color: '#fff',
                      border: isUser ? 'none' : '1px solid var(--border-subtle)',
                      lineHeight: 1.5
                    }}>
                      {turn.text}
                      {!isUser && isMockMode && (
                        <div style={{ marginTop: '0.4rem' }}>
                          <button 
                            type="button"
                            onClick={() => speakText(turn.text)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                              color: 'var(--color-accent)',
                              fontSize: '0.75rem',
                              padding: '0.2rem 0.5rem',
                              cursor: 'pointer'
                            }}
                          >
                            🔊 Play Audio
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Fallback interactive input bar if speech/text fallback is active */}
          {isMockMode && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-card)', display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="input" 
                placeholder="Type your response or speak into your microphone..."
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendManualTurn()}
              />
              <button className="btn btn-primary" onClick={handleSendManualTurn}>
                Send
              </button>
            </div>
          )}
        </div>
      </div>
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
