import React from 'react'
import { AlertCircleIcon, CheckCircleIcon, SparklesIcon } from './Icons'

const config = {
  applied: { className: 'status-pending', icon: AlertCircleIcon },
  cv_review: { className: 'status-pending', icon: AlertCircleIcon },
  ai_invited: { className: 'status-ai', icon: SparklesIcon },
  ai_interview: { className: 'status-ai', icon: SparklesIcon },
  ai_review: { className: 'status-ai', icon: SparklesIcon },
  hr_invited: { className: 'status-info', icon: CheckCircleIcon },
  hr_interview: { className: 'status-info', icon: CheckCircleIcon },
  selected: { className: 'status-qualified', icon: CheckCircleIcon },
  rejected: { className: 'status-rejected', icon: AlertCircleIcon },
  needs_attention: { className: 'status-attention', icon: AlertCircleIcon },
  draft: { className: 'status-neutral', icon: AlertCircleIcon },
  collecting: { className: 'status-qualified', icon: CheckCircleIcon },
  hr_review: { className: 'status-info', icon: CheckCircleIcon },
  completed: { className: 'status-qualified', icon: CheckCircleIcon },
}

export const StatusBadge = ({ stage, label }) => {
  const current = config[stage] || { className: 'status-neutral', icon: AlertCircleIcon }
  const Icon = current.icon
  const displayLabel = label || (stage ? stage.replaceAll('_', ' ').toUpperCase() : 'PENDING')

  return (
    <span className={`status-badge ${current.className}`}>
      <Icon className="status-badge-icon" />
      {displayLabel}
    </span>
  )
}
