'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

/** Native button behavior; callers explicitly opt into form submission. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', type = 'button', className = '', ...props }, ref,
) {
  return <button ref={ref} type={type} data-variant={variant} className={`ub-button ${className}`} {...props} />;
});
