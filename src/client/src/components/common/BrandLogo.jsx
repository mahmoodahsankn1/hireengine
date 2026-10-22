import React from 'react'

export const BrandLogo = ({ className = '' }) => (
  <span className={`brand-logo ${className}`.trim()}>
    <img src="/logo.png" alt="HireFlow HR" className="brand-logo-image" />
  </span>
)
