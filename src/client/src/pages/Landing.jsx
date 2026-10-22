import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowRight,
  AudioLines,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CirclePlay,
  FileCheck2,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { BrandLogo } from '../components/common/BrandLogo'

const candidates = [
  { initials: 'AM', name: 'Aarav Mehta', role: 'Senior Product Designer', score: '96%', tone: 'violet' },
  { initials: 'SK', name: 'Sarah Kim', role: 'Senior Product Designer', score: '92%', tone: 'cyan' },
  { initials: 'JR', name: 'Jordan Rivera', role: 'Senior Product Designer', score: '88%', tone: 'peach' },
]

export default function Landing() {
  return (
    <main className="landing">
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="HireFlow home">
          <BrandLogo />
        </Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#built-for-people">Why HireFlow</a>
        </nav>
        <div className="landing-header-actions">
          <Link className="landing-login-link" to="/login">Log in</Link>
          <Link className="landing-header-cta" to="/register">
            Get started <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow">
            <span className="landing-eyebrow-spark"><Sparkles size={14} aria-hidden="true" /></span>
            A clearer way to hire
          </div>
          <h1>
            Great people.
            <br />
            <span>Better together.</span>
          </h1>
          <p className="landing-hero-description">
            Bring every role, application, and interview into one thoughtful hiring flow.
            Spend less time chasing details and more time meeting your next great teammate.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-primary-cta" to="/login">
              Log in to HireFlow <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a className="landing-secondary-cta" href="#how-it-works">
              <CirclePlay size={19} aria-hidden="true" /> See how it works
            </a>
          </div>
          <div className="landing-trust-note">
            <span className="landing-trust-check"><Check size={12} aria-hidden="true" /></span>
            Designed for a more human hiring experience
          </div>
        </div>

        <div className="landing-visual" aria-label="A preview of the HireFlow candidate dashboard">
          <div className="landing-orbit landing-orbit-one" />
          <div className="landing-orbit landing-orbit-two" />
          <div className="landing-float-tag">
            <span className="landing-float-icon"><Sparkles size={15} aria-hidden="true" /></span>
            <span><strong>AI-assisted</strong><small>Human-led decisions</small></span>
          </div>
          <div className="landing-dashboard">
            <div className="landing-dash-top">
              <div>
                <span className="landing-dash-kicker">YOUR HIRING WORKSPACE</span>
                <h2>Good morning, Alex <span aria-hidden="true">✳</span></h2>
                <p>Your next great teammate is in here.</p>
              </div>
              <div className="landing-dash-avatar" aria-label="Alex">A</div>
            </div>

            <div className="landing-role-card">
              <div className="landing-role-icon"><BriefcaseBusiness size={17} aria-hidden="true" /></div>
              <div className="landing-role-info"><strong>Senior Product Designer</strong><span>Design · Remote · 24 applicants</span></div>
              <span className="landing-open-pill"><i /> Hiring</span>
            </div>

            <div className="landing-candidate-heading">
              <span>Top matches</span>
              <span>View all <ArrowRight size={13} aria-hidden="true" /></span>
            </div>
            <div className="landing-candidates">
              {candidates.map((candidate, index) => (
                <div className="landing-candidate" key={candidate.initials}>
                  <div className={`landing-candidate-avatar avatar-${candidate.tone}`}>{candidate.initials}</div>
                  <div className="landing-candidate-info"><strong>{candidate.name}</strong><span>{candidate.role}</span></div>
                  <div className="landing-match"><span>{candidate.score}</span><small>match</small></div>
                  {index === 0 && <span className="landing-best-match">BEST FIT</span>}
                </div>
              ))}
            </div>

            <div className="landing-dash-footer">
              <span><AudioLines size={15} aria-hidden="true" /> Interviews in one place</span>
              <span><CheckCircle2 size={15} aria-hidden="true" /> You make the call</span>
            </div>
          </div>
          <div className="landing-float-note">
            <span className="landing-note-check"><Check size={15} aria-hidden="true" /></span>
            <span><strong>Less admin.</strong><small>More meaningful conversations.</small></span>
            <ArrowDownRight className="landing-note-arrow" size={17} aria-hidden="true" />
          </div>
        </div>

        <a className="landing-scroll-cue" href="#how-it-works" aria-label="Scroll to learn more">
          <span>SCROLL TO EXPLORE</span><ArrowDownRight size={15} aria-hidden="true" />
        </a>
      </section>

      <section className="landing-proof" id="how-it-works">
        <div className="landing-proof-intro">
          <span className="landing-section-label">A better kind of hiring</span>
          <h2>All the moving parts.<br /><span>One clear path forward.</span></h2>
        </div>
        <div className="landing-proof-item">
          <span className="landing-proof-icon proof-violet"><FileCheck2 size={20} aria-hidden="true" /></span>
          <h3>Every application, organized</h3>
          <p>Keep roles, candidate details, and next steps together—not scattered across tabs.</p>
        </div>
        <div className="landing-proof-item" id="built-for-people">
          <span className="landing-proof-icon proof-cyan"><UsersRound size={20} aria-hidden="true" /></span>
          <h3>Thoughtful, structured interviews</h3>
          <p>Give your team a consistent process while keeping real conversations at the center.</p>
        </div>
        <div className="landing-proof-item">
          <span className="landing-proof-icon proof-peach"><Sparkles size={20} aria-hidden="true" /></span>
          <h3>Helpful AI. Human decisions.</h3>
          <p>Use AI to support your workflow, with your people always making the final call.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <Link to="/" className="landing-brand" aria-label="HireFlow home"><BrandLogo /></Link>
        <span>Better hiring starts with better flow.</span>
        <Link to="/login">Log in <ArrowRight size={14} aria-hidden="true" /></Link>
      </footer>
    </main>
  )
}
