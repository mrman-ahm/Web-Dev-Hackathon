import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDto } from '@/contracts/api';
import { PermissionsSettings } from '@/app/workspaces/[workspaceId]/settings/permissions/permissions-settings';

const workspace: WorkspaceDto = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Example workspace',
  timezone: 'UTC',
  defaultCurrency: 'USD',
  version: 1,
};

describe('PermissionsSettings', () => {
  it('creates a named role with the selected grants through the workspace API', async () => {
    const role = { id: '20000000-0000-4000-8000-000000000001', name: 'Owner', systemDefault: true, permissionKeys: [], version: 1 };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: { roles: [role], catalog: [{ key: 'crm.values.view', description: 'View opportunity values' }] }, meta: { requestId: 'read' } }))
      .mockResolvedValueOnce(Response.json({ data: { ...role, id: '20000000-0000-4000-8000-000000000002', name: 'Manager', systemDefault: false, permissionKeys: ['crm.values.view'] }, meta: { requestId: 'write' } }, { status: 201 }));

    render(<PermissionsSettings workspace={workspace} />);
    fireEvent.change(await screen.findByLabelText('Role to configure'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Manager' } });
    fireEvent.click(screen.getByLabelText(/crm\.values\.view/));
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/v1/workspaces/${workspace.id}/roles`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ name: 'Manager', permissionKeys: ['crm.values.view'] });
    expect(await screen.findByRole('status')).toHaveTextContent('Role created.');
  });
});
