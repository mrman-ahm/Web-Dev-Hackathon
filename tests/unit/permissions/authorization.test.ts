import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { DomainError } from '@/lib/errors';
import { projectProtectedValue, requirePermission } from '@/modules/permissions/authorization';
import { getPermissionConfiguration } from '@/modules/permissions/service';

describe('permission authorization', () => {
  it('uses the current permission RPC result so a revoked grant is denied', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ key: 'crm.values.view' }], error: null });
    await expect(requirePermission({ rpc } as never, 'workspace-a', 'crm.values.view')).resolves.toBeUndefined();

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(requirePermission({ rpc } as never, 'workspace-a', 'crm.values.view')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'get_my_permissions', { p_workspace_id: 'workspace-a' });
  });

  it('fails closed on a cross-workspace permission lookup', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PT403' } });
    await expect(requirePermission({ rpc } as never, 'other-workspace', 'members.view')).rejects.toBeInstanceOf(DomainError);
  });

  it('checks permission before reading administration data', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await expect(getPermissionConfiguration({ rpc } as never, 'workspace-a')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_my_permissions', { p_workspace_id: 'workspace-a' });
  });

  it('omits the protected value unless the caller has the explicit grant', () => {
    expect(projectProtectedValue('12500', 'USD', new Set())).toEqual({ visibility: 'hidden' });
    expect(projectProtectedValue('12500', 'USD', new Set(['crm.values.view']))).toEqual({
      visibility: 'visible',
      money: { amountMinor: '12500', currency: 'USD' },
    });
  });
});
