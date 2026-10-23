import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowRight,
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Code2,
  ContactRound,
  FileCheck2,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { BrandLogo } from '../components/common/BrandLogo'

const previewStats = [
  { label: 'Active Jobs', value: '3', icon: BriefcaseBusiness, tone: 'blue' },
  { label: 'Applications', value: '11', icon: FileCheck2, tone: 'cyan' },
  { label: 'CVs to Review', value: '0', icon: AlertTriangle, tone: 'orange' },
  { label: 'Interviews', value: '0', icon: CalendarDays, tone: 'violet' },
]

const previewJobs = [
  { title: 'AI Automation Specialist', stage: 'Collecting', tone: 'green', location: 'Thrissur', count: '2 applications', date: '23 Oct 2026' },
  { title: 'AI Automation Specialist', stage: 'HR Review', tone: 'blue', location: 'Thrissur', count: '4 applications', date: '21 Oct 2026' },
  { title: 'Senior Full-Stack Engineer', stage: 'AI Review', tone: 'violet', location: 'Bengaluru, India', count: '5 applications', date: '22 Oct 2026' },
]

export default function Landing() {
  return (
    <main className="landing">
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="HireEngine home">
          <BrandLogo />
        </Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#about-us">About Us</a>
          <a href="#how-it-works">How It Works</a>
        </nav>
        <div className="landing-header-actions">
          <Link className="landing-login-link" to="/login">Log in</Link>
          <Link className="landing-header-cta" to="/register">
            Register <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow">
            <span className="landing-eyebrow-spark"><Sparkles size={14} aria-hidden="true" /></span>
            End-to-end hiring workflow
          </div>
          <h1>
            From first CV to
            <br />
            <span>final hire.</span>
            <br />
            One clear path.
          </h1>
          <p className="landing-hero-description">
            Publish roles, collect CVs, anonymize and rank applicants, run timed AI voice interviews,
            then schedule clash-free HR meetings. AI supports evaluation; your team makes the final decision.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-primary-cta" to="/register">
              Build Your Hiring Pipeline <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a className="landing-secondary-cta" href="#how-it-works">
              Explore the Platform
            </a>
          </div>
        </div>

        <div className="landing-visual" aria-label="A preview of the HireEngine HR dashboard">
          <div className="landing-orbit landing-orbit-one" />
          <div className="landing-orbit landing-orbit-two" />
          <div className="landing-dashboard">
            <div className="landing-preview-topbar">
              <BrandLogo />
              <span className="landing-preview-user">Mahmood Ahsan <i>MA</i></span>
            </div>
            <div className="landing-preview-main">
              <div className="landing-preview-welcome">
                <span>HR DASHBOARD</span>
                <strong>Welcome back, Mahmood <span aria-hidden="true">👋</span></strong>
                <small>Track anonymized CV reviews, AI interviews, and final HR decisions.</small>
                <span className="landing-preview-post"><Plus size={13} /> Post New Job</span>
              </div>
              <div className="landing-preview-stats">
                {previewStats.map(({ label, value, icon: Icon, tone }) => (
                  <div className="landing-preview-stat" key={label}>
                    <span className={`preview-icon preview-${tone}`}><Icon size={13} aria-hidden="true" /></span>
                    <span className="preview-stat-copy"><small>{label}</small><strong>{value}</strong></span>
                  </div>
                ))}
              </div>
              <div className="landing-preview-jobs-heading">
                <span><strong>Your Jobs</strong> (3)</span>
                <span><Search size={11} /> Search jobs... <i>All Status⌄</i></span>
              </div>
              <div className="landing-preview-jobs">
                {previewJobs.map(job => (
                  <article className="landing-preview-job" key={`${job.title}-${job.stage}`}>
                    <div className="landing-preview-job-title"><strong>{job.title}</strong><span className={`preview-status status-${job.tone}`}><i />{job.stage}</span></div>
                    <div className="landing-preview-job-meta">
                      <span><MapPin size={10} />{job.location}</span>
                      <span><Clock3 size={10} />Full time</span>
                      <span><CalendarDays size={10} />{job.date}</span>
                      <span><UsersRound size={10} />{job.count}</span>
                    </div>
                    <div className="landing-preview-job-actions">
                      <span><Link2 size={11} /> Copy Link</span>
                      <span><Pencil size={11} /> Edit</span>
                    </div>
                  </article>
                ))}
            </div>
          </div>
        </div>
        </div>

        <a className="landing-scroll-cue" href="#how-it-works" aria-label="Scroll to learn more">
          <span>SCROLL TO EXPLORE</span><ArrowDownRight size={15} aria-hidden="true" />
        </a>
      </section>

      <section className="landing-proof" id="features">
        <div className="landing-proof-intro">
          <span className="landing-section-label">A better kind of hiring</span>
          <h2>All the moving parts.<br /><span>One clear path forward.</span></h2>
        </div>
        <div className="landing-proof-item">
          <span className="landing-proof-icon proof-violet"><FileCheck2 size={20} aria-hidden="true" /></span>
          <h3>Every application, organized</h3>
          <p>Keep roles, candidate details, and next steps together—not scattered across tabs.</p>
        </div>
        <div className="landing-proof-item">
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

      <section className="landing-how" id="how-it-works">
        <div className="landing-how-intro">
          <span className="landing-section-label">How it works</span>
          <h2>From open role to <span>great hire.</span></h2>
          <p>A simpler, more connected hiring journey for your whole team.</p>
        </div>
        <div className="landing-how-steps">
          <article><span>01</span><h3>Create a role</h3><p>Set up a job and bring every application into one organized workspace.</p></article>
          <article><span>02</span><h3>Find your match</h3><p>Review candidates with helpful matching insights and a clear hiring pipeline.</p></article>
          <article><span>03</span><h3>Meet and decide</h3><p>Coordinate interviews, share feedback, and let your team make the final call.</p></article>
        </div>
      </section>

      <section className="landing-about" id="about-us">
        <div>
          <span className="landing-section-label">About the creator</span>
          <h2>Hi, I’m Mahmood Ahsan.</h2>
          <p>
            I’m currently pursuing a Master of Computer Applications at Vidya Academy of Science
            and Technology, with an expected graduation in May 2027. I also hold a Bachelor of
            Computer Applications.
          </p>
        </div>
        <div className="landing-about-links">
          <a href="https://www.linkedin.com/in/mahmoodahsan" target="_blank" rel="noreferrer">
            <ContactRound size={19} aria-hidden="true" /> Connect on LinkedIn <ArrowRight size={15} aria-hidden="true" />
          </a>
          <a href="https://github.com/mahmoodahsankn1/" target="_blank" rel="noreferrer">
            <Code2 size={19} aria-hidden="true" /> Explore my GitHub <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

      <footer className="landing-footer">
        <Link to="/" className="landing-brand" aria-label="HireEngine home"><BrandLogo /></Link>
        <span>HireEngine · Created by Mahmood Ahsan</span>
        <Link to="/login">Log in <ArrowRight size={14} aria-hidden="true" /></Link>
      </footer>
    </main>
  )
}
