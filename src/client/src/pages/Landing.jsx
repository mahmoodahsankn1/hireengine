import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { BrandLogo } from '../components/common/BrandLogo'

const pipelineStages = [
  {
    id: 'applications',
    label: 'Applications',
    candidates: [
      { initials: 'MC', name: 'Maya Chen', role: 'Product Designer', status: 'New application' },
      { initials: 'JR', name: 'Jordan Rivera', role: 'Product Designer', status: 'Resume received' },
      { initials: 'AP', name: 'Avery Patel', role: 'Product Designer', status: 'Ready to review' },
    ],
  },
  {
    id: 'interviews',
    label: 'Interviews',
    candidates: [
      { initials: 'SK', name: 'Sam Kim', role: 'Product Designer', status: 'AI interview invited' },
      { initials: 'TG', name: 'Taylor Green', role: 'Product Designer', status: 'Interview complete' },
    ],
  },
  {
    id: 'team-review',
    label: 'Team review',
    candidates: [
      { initials: 'RL', name: 'Riley Lee', role: 'Product Designer', status: 'HR interview' },
    ],
  },
]

const features = [
  {
    title: 'Keep every role moving',
    description: 'Create a clear home for each opening, its requirements, its applicants, and the next step.',
  },
  {
    title: 'Review with more context',
    description: 'Bring structured CV review and interview signals together without giving up human judgment.',
  },
  {
    title: 'Make interviews easier to plan',
    description: 'Set availability and coordinate candidate interviews around the people on your team.',
  },
]

export default function Landing() {
  const [activeStage, setActiveStage] = useState(pipelineStages[0].id)
  const selectedStage = pipelineStages.find(stage => stage.id === activeStage)

  return (
    <main className="landing" id="main-content">
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="Hire Engine home">
          <BrandLogo />
        </Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#features">What you can do</a>
          <a href="#how-it-works">How it works</a>
          <a href="#about-us">About</a>
        </nav>
        <div className="landing-header-actions">
          <Link className="landing-login-link" to="/login">Sign in</Link>
          <Link className="landing-header-cta" to="/register">
            Create an account <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section className="landing-hero" id="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <h1 id="landing-title">Hire clearly.<br />Decide with care.</h1>
          <p className="landing-hero-description">
            Publish roles, review applicants, and coordinate interviews in one thoughtful hiring workspace.
            AI can help organize the process; your team makes every hiring decision.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-primary-cta" to="/register">
              Start hiring <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a className="landing-secondary-cta" href="#how-it-works">
              See how it works
            </a>
          </div>
        </div>

        <section className="landing-demo" data-ui aria-label="Interactive example hiring pipeline">
          <header className="landing-demo-heading">
            <div>
              <h2>Candidate pipeline</h2>
              <p>Move through each stage with your team.</p>
            </div>
            <span className="landing-demo-sample">Example data</span>
          </header>
          <div className="landing-demo-tabs" role="group" aria-label="Filter example candidates">
            {pipelineStages.map(stage => (
              <button
                key={stage.id}
                type="button"
                aria-pressed={activeStage === stage.id}
                onClick={() => setActiveStage(stage.id)}
              >
                {stage.label}
                <span>{stage.candidates.length}</span>
              </button>
            ))}
          </div>
          <ul className="landing-demo-candidates" aria-live="polite">
            {selectedStage.candidates.map(candidate => (
              <li className="landing-demo-candidate" key={candidate.name}>
                <span className="landing-demo-avatar" aria-hidden="true">{candidate.initials}</span>
                <span className="landing-demo-candidate-copy">
                  <strong>{candidate.name}</strong>
                  <span>{candidate.role}</span>
                </span>
                <span className="landing-demo-status">{candidate.status}</span>
              </li>
            ))}
          </ul>
          <p className="landing-demo-note">AI supports the review. Your team makes the final call.</p>
        </section>
      </section>

      <section className="landing-features" id="features" aria-labelledby="features-title">
        <div className="landing-section-intro">
          <h2 id="features-title">One process, from role to decision</h2>
          <p>Give your hiring team a shared view of what is happening and what needs attention next.</p>
        </div>
        <div className="landing-feature-list">
          {features.map(({ title, description }) => (
            <article className="landing-feature" key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-how" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-how-intro">
          <h2 id="how-title">A clearer hiring journey</h2>
          <p>Keep the next action visible at every stage, from opening a role to meeting a candidate.</p>
        </div>
        <ol className="landing-how-steps">
          <li>
            <h3>Set up the role</h3>
            <p>Define the position, requirements, and interview availability before you publish.</p>
          </li>
          <li>
            <h3>Review applicants</h3>
            <p>Collect applications and use structured signals to decide who moves forward.</p>
          </li>
          <li>
            <h3>Meet and decide</h3>
            <p>Coordinate interviews, share feedback, and keep the hiring decision with your team.</p>
          </li>
        </ol>
      </section>

      <section className="landing-about" id="about-us" aria-labelledby="about-title">
        <div>
          <h2 id="about-title">Built with care for better hiring</h2>
          <p>
            HireEngine is a recruiting project by Mahmood Ahsan, created to make role management,
            candidate review, and interview coordination feel like one connected process.
          </p>
        </div>
        <div className="landing-about-links">
          <a href="https://www.linkedin.com/in/mahmoodahsan" target="_blank" rel="noreferrer">
            Connect on LinkedIn <ArrowRight size={15} aria-hidden="true" />
          </a>
          <a href="https://github.com/mahmoodahsankn1/" target="_blank" rel="noreferrer">
            Explore the project <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

      <footer className="landing-footer">
        <Link to="/" className="landing-brand" aria-label="Hire Engine home"><BrandLogo /></Link>
        <span>Hire Engine · A connected hiring workspace</span>
        <Link to="/login">Sign in <ArrowRight size={14} aria-hidden="true" /></Link>
      </footer>
    </main>
  )
}
