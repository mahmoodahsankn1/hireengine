import React from 'react'

export const HeroBackground = ({ children }) => {
  const bgImageSrc = '/assets/hero-bg.jpg'

  return (
    <div className="hero-background">
      <div className="hero-background-image" style={{ backgroundImage: `url(${bgImageSrc})` }} aria-hidden="true" />
      <div className="hero-background-overlay" aria-hidden="true" />
      <div className="hero-background-content">
        {children}
      </div>
    </div>
  )
}
