import React from 'react'

const variants = {
  primary: 'button-primary',
  secondary: 'button-secondary',
  accent: 'button-accent',
  outline: 'button-outline',
}

const sizes = {
  sm: 'button-sm',
  md: 'button-md',
  lg: 'button-lg',
}

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  ...props
}) => (
  <button
    className={`ui-button ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`.trim()}
    {...props}
  >
    {Icon && <Icon className="button-icon" />}
    {children}
  </button>
)
