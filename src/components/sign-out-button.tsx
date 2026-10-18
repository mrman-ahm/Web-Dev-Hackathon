'use client';

import { useState } from 'react';
import { ApiErrorSchema } from '@/contracts/api';
import { Button } from './button';

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'local' }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsed = ApiErrorSchema.safeParse(payload);
        setError(parsed.success ? parsed.data.error.message : 'Sign out could not be completed.');
        return;
      }
      window.location.assign('/login');
    } catch {
      setError('The service could not be reached. Try again.');
    } finally {
      setPending(false);
    }
  }

  return <div className="ub-signout">
    <Button variant="secondary" onClick={signOut} disabled={pending}>{pending ? 'Signing out…' : 'Sign out'}</Button>
    {error && <p role="alert" className="ub-auth-error">{error}</p>}
  </div>;
}
