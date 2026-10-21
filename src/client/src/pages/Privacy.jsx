import { Link } from 'react-router-dom'
import { Shield, Lock, Eye, Clock, UserCheck, ArrowLeft } from 'lucide-react'

export default function Privacy() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '2rem 1rem' }}>
      <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
        
        {/* Navigation header */}
        <div style={{ marginBottom: '2rem' }}>
          <button 
            onClick={() => window.history.back()} 
            className="btn btn-secondary" 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ 
              background: 'rgba(99,102,241,0.15)', 
              color: 'var(--color-primary-light)', 
              padding: '0.35rem 0.75rem', 
              borderRadius: '999px', 
              fontSize: '0.8rem', 
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <Shield size={14} /> HireFlow Candidate Privacy Policy
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Version 1.0 (Active)</span>
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            Privacy & Automated Processing Notice
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6' }}>
            HireFlow is dedicated to transparent, fair, and secure hiring. This policy explains how we collect, process, 
            anonymize, and safeguard your data during the recruitment lifecycle.
          </p>
        </div>

        {/* Content Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div className="card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(99,102,241,0.15)', borderRadius: 'var(--radius-md)', color: 'var(--color-primary-light)' }}>
                <Eye size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem' }}>1. Information We Collect</h2>
            </div>
            <p style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
              When you submit an application, we collect only the necessary information required for evaluation:
            </p>
            <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.925rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong>Contact Details:</strong> Your full name, email address, and phone number.</li>
              <li><strong>Resume / Curriculum Vitae:</strong> Professional background, work history, skills, and educational qualifications extracted from your uploaded PDF or DOCX file.</li>
              <li><strong>Technical Logs:</strong> Application submission timestamps and status logs.</li>
            </ul>
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', color: 'var(--color-success)' }}>
              🔒 <strong>Media Privacy Guarantee:</strong> We do NOT record, capture, or store candidate video or audio streams. Video interviews are conducted over peer-to-peer WebRTC connections.
            </div>
          </div>

          <div className="card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(6,182,212,0.15)', borderRadius: 'var(--radius-md)', color: 'var(--color-accent)' }}>
                <Lock size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem' }}>2. AI Redaction & Blind Screening</h2>
            </div>
            <p style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
              To prevent bias, HireFlow applies automated redaction before human recruiters review Round 1 applications:
            </p>
            <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.925rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><strong>Automatic PII Stripping:</strong> Candidate names, emails, phone numbers, addresses, social links, gender pronouns, and demographic markers are programmatically redacted.</li>
              <li><strong>Blind Evaluation:</strong> Recruiters evaluate candidates anonymously as <em>"Candidate #n"</em> based strictly on job-relevant skills, roles, and experience.</li>
              <li><strong>Rubric Scoring:</strong> AI evaluates resumes strictly against predefined job competencies (Skills: 50%, Experience: 30%, Education: 20%).</li>
            </ul>
          </div>

          <div className="card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(245,158,11,0.15)', borderRadius: 'var(--radius-md)', color: 'var(--color-warning)' }}>
                <UserCheck size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem' }}>3. Human-in-the-Loop Decision Making</h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
              Artificial intelligence outputs in HireFlow are <strong>strictly advisory</strong>. No candidate is ever automatically rejected 
              or advanced solely by an algorithm. All shortlisting, interview invitations, and final hiring selections require 
              an explicit decision and button press by the employer's HR team.
            </p>
          </div>

          <div className="card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(99,102,241,0.15)', borderRadius: 'var(--radius-md)', color: 'var(--color-primary-light)' }}>
                <Clock size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem' }}>4. Data Retention & Deletion</h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
              Candidate application files, anonymized texts, and interview data are retained for a maximum of 
              <strong> 90 days</strong> after the corresponding job posting has been marked completed or removed. 
              An automated system routine purges candidate records past this retention window. You may also contact 
              the hiring organization at any time to request earlier deletion of your application record.
            </p>
          </div>

        </div>

        {/* Footer info */}
        <div style={{ textAlign: 'center', marginTop: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          HireFlow Hiring Engine · Academic Mini Project · All rights reserved.
        </div>

      </div>
    </div>
  )
}
