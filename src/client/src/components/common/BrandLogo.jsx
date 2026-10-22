import React, { useState } from 'react'

export const BrandLogo = ({ className = 'h-8' }) => {
  const [logoFailed, setLogoFailed] = useState(false)

  return (
    <div className={`brand-logo ${className}`}>
      {!logoFailed ? (
        <img
          src="/assets/logo.svg"
          alt="HireFlow HR Logo"
          className="brand-logo-image"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span className="brand-logo-mark" aria-hidden="true">HIE</span>
      )}
      <span className="brand-logo-name">
        HireFlow <span>HR</span>
      </span>
    </div>
  )
}
