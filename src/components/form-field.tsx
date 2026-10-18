'use client';

import { cloneElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode } from 'react';

export type FormFieldProps = {
  label: string;
  error?: string;
  description?: ReactNode;
  children: ReactElement<InputHTMLAttributes<HTMLInputElement>>;
};

/** One control per field. Child IDs and existing description relationships survive composition. */
export function FormField({ label, error, description, children }: FormFieldProps) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [children.props['aria-describedby'], description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean).join(' ') || undefined;
  return <div className="ub-field">
    <label htmlFor={id}>{label}</label>
    {description && <p id={descriptionId} className="ub-field-description">{description}</p>}
    {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : children.props['aria-invalid'] })}
    {error && <p id={errorId} className="ub-field-error">{error}</p>}
  </div>;
}
