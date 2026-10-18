'use client';

import { useState, type FormEvent } from 'react';
import { ApiErrorSchema, ApiSuccessSchema, LoginInputSchema, SignupInputSchema } from '@/contracts/api';
import { AuthSessionDtoSchema, SignupResultSchema } from '@/contracts/auth';
import { Button } from './button';
import { FormField } from './form-field';
import { Input } from './input';

type AuthEntryProps = { mode: 'login' | 'signup'; initialMessage?: string; initialError?: string };
type FormValues = {
  email: string;
  password: string;
  displayName: string;
  workspaceName: string;
  timezone: string;
  defaultCurrency: string;
};

function safeError(payload: unknown): string {
  const parsed = ApiErrorSchema.safeParse(payload);
  return parsed.success ? parsed.data.error.message : 'The request could not be completed. Try again.';
}

export function AuthEntry({ mode, initialMessage = '', initialError = '' }: AuthEntryProps) {
  const [form, setForm] = useState<FormValues>({
    email: '', password: '', displayName: '', workspaceName: '', timezone: 'UTC', defaultCurrency: 'USD',
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState(initialError);

  function update<K extends keyof FormValues>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    const input = mode === 'signup'
      ? SignupInputSchema.safeParse(form)
      : LoginInputSchema.safeParse({ email: form.email, password: form.password });
    if (!input.success) {
      setError('Check the highlighted fields and try again.');
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`/api/v1/auth/${mode === 'signup' ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(safeError(payload));
        return;
      }

      if (mode === 'signup') {
        const result = ApiSuccessSchema(SignupResultSchema).safeParse(payload);
        if (!result.success) {
          setError('The server returned an unexpected response. Try again.');
          return;
        }
        if (result.data.data.requiresEmailConfirmation) {
          setMessage('If this address can be registered, check it for a confirmation link. You are not signed in yet.');
          return;
        }
        const session = AuthSessionDtoSchema.safeParse(result.data.data.session);
        if (!session.success) {
          setError('The server returned an unexpected session. Try again.');
          return;
        }
      } else {
        const result = ApiSuccessSchema(AuthSessionDtoSchema).safeParse(payload);
        if (!result.success) {
          setError('The server returned an unexpected session. Try again.');
          return;
        }
      }
      window.location.assign('/workspace');
    } catch {
      setError('The service could not be reached. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return <form className="ub-auth-form" onSubmit={submit} aria-busy={pending}>
    {mode === 'signup' && <>
      <FormField label="Your name" description="Shown to teammates in your workspace.">
        <Input autoComplete="name" maxLength={120} required value={form.displayName} onChange={(event) => update('displayName', event.currentTarget.value)} />
      </FormField>
      <FormField label="Workspace name">
        <Input autoComplete="organization" maxLength={120} required value={form.workspaceName} onChange={(event) => update('workspaceName', event.currentTarget.value)} />
      </FormField>
    </>}
    <FormField label="Work email">
      <Input type="email" name="email" autoComplete="email" maxLength={254} required value={form.email} onChange={(event) => update('email', event.currentTarget.value)} />
    </FormField>
    <FormField label="Password" description={mode === 'signup' ? 'Use at least 12 characters.' : undefined}>
      <Input type="password" name="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 12 : 1} maxLength={128} required value={form.password} onChange={(event) => update('password', event.currentTarget.value)} />
    </FormField>
    {mode === 'signup' && <div className="ub-auth-row">
      <FormField label="Time zone"><Input name="timezone" autoComplete="off" maxLength={100} required value={form.timezone} onChange={(event) => update('timezone', event.currentTarget.value)} /></FormField>
      <FormField label="Currency"><Input name="defaultCurrency" autoComplete="off" maxLength={3} minLength={3} required value={form.defaultCurrency} onChange={(event) => update('defaultCurrency', event.currentTarget.value.toUpperCase())} /></FormField>
    </div>}
    {error && <p className="ub-auth-error" role="alert">{error}</p>}
    {message && <p className="ub-auth-message" role="status" aria-live="polite">{message}</p>}
    <Button type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'signup' ? 'Create workspace' : 'Sign in'}</Button>
  </form>;
}
