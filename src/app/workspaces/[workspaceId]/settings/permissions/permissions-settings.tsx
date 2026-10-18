'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiErrorSchema, ApiSuccessSchema, type WorkspaceDto } from '@/contracts/api';
import { Button } from '@/components/button';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/input';
import { PermissionConfigurationSchema, PermissionRoleSchema, type PermissionConfiguration, type PermissionRole } from '@/modules/permissions/schemas';

export function PermissionsSettings({ workspace }: { workspace: WorkspaceDto }) {
  const [configuration, setConfiguration] = useState<PermissionConfiguration | null>(null);
  const [roleId, setRoleId] = useState('');
  const [name, setName] = useState('');
  const [permissionKeys, setPermissionKeys] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const selectedRole = useMemo(() => configuration?.roles.find((role) => role.id === roleId) ?? null, [configuration, roleId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/workspaces/${workspace.id}/roles`, { cache: 'no-store' })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const parsed = ApiErrorSchema.safeParse(payload);
          throw new Error(parsed.success ? parsed.data.error.message : 'Permissions could not be loaded.');
        }
        const parsed = ApiSuccessSchema(PermissionConfigurationSchema).safeParse(payload);
        if (!parsed.success) throw new Error('The server returned an unexpected permission configuration.');
        return parsed.data.data;
      })
      .then((data) => {
        if (!active) return;
        setConfiguration(data);
        const initial = data.roles[0];
        if (initial) selectRole(initial, setRoleId, setName, setPermissionKeys);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Permissions could not be loaded.'); });
    return () => { active = false; };
  }, [workspace.id]);

  function chooseRole(nextRoleId: string) {
    setRoleId(nextRoleId);
    const role = configuration?.roles.find((item) => item.id === nextRoleId);
    if (role) selectRole(role, setRoleId, setName, setPermissionKeys);
    else { setName(''); setPermissionKeys(new Set()); }
    setError('');
    setStatus('');
  }

  function togglePermission(key: string) {
    setPermissionKeys((current) => {
      const updated = new Set(current);
      if (updated.has(key)) updated.delete(key); else updated.add(key);
      return updated;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration) return;
    setPending(true);
    setError('');
    setStatus('');
    try {
      const editing = selectedRole !== null;
      const response = await fetch(editing
        ? `/api/v1/workspaces/${workspace.id}/roles/${selectedRole.id}`
        : `/api/v1/workspaces/${workspace.id}/roles`, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          permissionKeys: [...permissionKeys].sort(),
          ...(editing ? { expectedVersion: selectedRole.version } : {}),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsed = ApiErrorSchema.safeParse(payload);
        setError(parsed.success ? parsed.data.error.message : 'Role permissions could not be saved.');
        return;
      }
      const parsed = ApiSuccessSchema(PermissionRoleSchema).safeParse(payload);
      if (!parsed.success) { setError('The server returned an unexpected role.'); return; }
      const savedRole = parsed.data.data;
      setConfiguration((current) => current && ({
        ...current,
        roles: current.roles.some((role) => role.id === savedRole.id)
          ? current.roles.map((role) => role.id === savedRole.id ? savedRole : role)
          : [...current.roles, savedRole].sort((left, right) => left.name.localeCompare(right.name)),
      }));
      setRoleId(savedRole.id);
      setName(savedRole.name);
      setPermissionKeys(new Set(savedRole.permissionKeys));
      setStatus(editing ? 'Role grants saved.' : 'Role created.');
    } catch {
      setError('The service could not be reached. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return <main id="permissions-content" className="ub-workspace-main" tabIndex={-1}>
    <div className="ub-page ub-stack-lg">
      <div className="ub-stack">
        <a href={`/workspaces/${workspace.id}/settings`}>← Workspace settings</a>
        <p className="ub-eyebrow">{workspace.name}</p>
        <h1>Roles and permissions</h1>
        <p className="ub-muted">Choose grants for each role. Role names carry no automatic permissions; changes apply to future requests immediately.</p>
      </div>
      {error && !configuration && <p className="ub-auth-error" role="alert">{error}</p>}
      {!configuration && !error && <p role="status">Loading roles and grants…</p>}
      {configuration && <div className="ub-panel ub-stack-lg">
        {error && <p className="ub-auth-error" role="alert">{error}</p>}
        <div className="ub-field"><label htmlFor="permission-role">Role to configure</label>
          <select id="permission-role" className="ub-input" value={roleId} onChange={(event) => chooseRole(event.currentTarget.value)}>
            {configuration.roles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.systemDefault ? ' · default' : ''}</option>)}
            <option value="">Create a role…</option>
          </select>
        </div>
        <form className="ub-stack-lg" onSubmit={save} aria-busy={pending}>
          <FormField label="Role name" description="For example, Manager. Grants below define its access.">
            <Input required maxLength={80} value={name} onChange={(event) => setName(event.currentTarget.value)} />
          </FormField>
          <fieldset className="ub-stack">
            <legend>Grants</legend>
            {configuration.catalog.map((permission) => {
              const inputId = `permission-${permission.key}`;
              return <div className="ub-row" key={permission.key}>
                <input id={inputId} type="checkbox" checked={permissionKeys.has(permission.key)} onChange={() => togglePermission(permission.key)} />
                <label htmlFor={inputId}><strong>{permission.key}</strong><br /><span className="ub-muted">{permission.description}</span></label>
              </div>;
            })}
          </fieldset>
          {status && <p className="ub-auth-message" role="status" aria-live="polite">{status}</p>}
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : selectedRole ? 'Save role grants' : 'Create role'}</Button>
        </form>
      </div>}
    </div>
  </main>;
}

function selectRole(
  role: PermissionRole,
  setRoleId: (value: string) => void,
  setName: (value: string) => void,
  setPermissionKeys: (value: Set<string>) => void,
) {
  setRoleId(role.id);
  setName(role.name);
  setPermissionKeys(new Set(role.permissionKeys));
}
