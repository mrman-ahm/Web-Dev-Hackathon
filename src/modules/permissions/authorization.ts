import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError, fromDatabaseError } from '../../lib/errors';

export type PermissionKey = string;
type PermissionRow = { key?: unknown };

/** Resolve grants from the current database state for every protected operation. */
export async function getCurrentPermissions(client: SupabaseClient, workspaceId: string): Promise<Set<PermissionKey>> {
  const { data, error } = await client.rpc('get_my_permissions', { p_workspace_id: workspaceId });
  if (error) throw fromDatabaseError(error);
  if (!Array.isArray(data)) throw new DomainError('INTERNAL_ERROR');
  const permissions = new Set<string>();
  for (const row of data as PermissionRow[]) {
    if (typeof row?.key !== 'string') throw new DomainError('INTERNAL_ERROR');
    permissions.add(row.key);
  }
  return permissions;
}

export async function requirePermission(client: SupabaseClient, workspaceId: string, permission: PermissionKey): Promise<void> {
  const permissions = await getCurrentPermissions(client, workspaceId);
  if (!permissions.has(permission)) throw new DomainError('FORBIDDEN');
}

/** Remove protected money before serialization when the caller lacks its field grant. */
export function projectProtectedValue(
  amountMinor: string,
  currency: string,
  permissions: ReadonlySet<PermissionKey>,
): { visibility: 'visible'; money: { amountMinor: string; currency: string } } | { visibility: 'hidden' } {
  if (!permissions.has('crm.values.view')) return { visibility: 'hidden' };
  return { visibility: 'visible', money: { amountMinor, currency } };
}
