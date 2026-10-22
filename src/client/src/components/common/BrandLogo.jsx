import React from 'react'

export const BrandLogo = ({ className = '' }) => (
  <span className={`brand-logo ${className}`.trim()}>
    <img src="/logo.png" alt="HireEngine HR" className="brand-logo-image" />
  </span>
)
