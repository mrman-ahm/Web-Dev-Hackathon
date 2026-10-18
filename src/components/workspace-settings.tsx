'use client';

import { useState, type FormEvent } from 'react';
import { ApiErrorSchema, ApiSuccessSchema, WorkspaceDtoSchema, type UserDto, type WorkspaceDto } from '@/contracts/api';
import { Button } from './button';
import { FormField } from './form-field';
import { Input } from './input';
import { SignOutButton } from './sign-out-button';

export function WorkspaceSettings({ user, workspace: initialWorkspace }: { user: UserDto; workspace: WorkspaceDto }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [name, setName] = useState(initialWorkspace.name);
  const [timezone, setTimezone] = useState(initialWorkspace.timezone);
  const [defaultCurrency, setDefaultCurrency] = useState(initialWorkspace.defaultCurrency);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(`/api/v1/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: workspace.version, name, timezone, defaultCurrency }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsed = ApiErrorSchema.safeParse(payload);
        setError(parsed.success ? parsed.data.error.message : 'Workspace settings could not be saved.');
        return;
      }
      const result = ApiSuccessSchema(WorkspaceDtoSchema).safeParse(payload);
      if (!result.success) {
        setError('The server returned an unexpected workspace. Reload this page and try again.');
        return;
      }
      setWorkspace(result.data.data);
      setName(result.data.data.name);
      setTimezone(result.data.data.timezone);
      setDefaultCurrency(result.data.data.defaultCurrency);
      setStatus('Workspace settings saved.');
    } catch {
      setError('The service could not be reached. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return <div className="ub-workspace-shell">
    <a href="#workspace-content" className="ub-skip">Skip to settings</a>
    <header className="ub-workspace-header">
      <div><p className="ub-eyebrow">Unified Business Management</p><p className="ub-workspace-name">{workspace.name}</p></div>
      <div className="ub-row"><span>{user.displayName}</span><SignOutButton /></div>
    </header>
    <main id="workspace-content" className="ub-workspace-main" tabIndex={-1}>
      <div className="ub-page">
        <div className="ub-stack">
          <p className="ub-eyebrow">Workspace configuration</p>
          <h1>Workspace settings</h1>
          <p className="ub-muted">Changes are saved to this workspace and checked against its current version.</p>
        </div>
        <form className="ub-panel ub-stack-lg" onSubmit={save} aria-busy={pending}>
          <h2>Workspace details</h2>
          <FormField label="Workspace name"><Input required maxLength={120} value={name} onChange={(event) => setName(event.currentTarget.value)} /></FormField>
          <FormField label="Time zone" description="Use an IANA time zone, such as Asia/Karachi or UTC.">
            <Input required maxLength={100} value={timezone} onChange={(event) => setTimezone(event.currentTarget.value)} />
          </FormField>
          <FormField label="Default currency" description="Enter a three-letter ISO currency code.">
            <Input required minLength={3} maxLength={3} pattern="[A-Z]{3}" value={defaultCurrency} onChange={(event) => setDefaultCurrency(event.currentTarget.value.toUpperCase())} />
          </FormField>
          {error && <p className="ub-auth-error" role="alert">{error}</p>}
          {status && <p className="ub-auth-message" role="status" aria-live="polite">{status}</p>}
          <div className="ub-row"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</Button><span className="ub-muted">Version {workspace.version}</span></div>
        </form>
      </div>
    </main>
  </div>;
}
