import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DomainError, fromDatabaseError } from '../../lib/errors';
import { requirePermission } from './authorization';
import {
  PermissionConfigurationSchema,
  PermissionRoleSchema,
  ReplaceOverridesResultSchema,
  type PermissionConfiguration,
  type RoleInput,
  type RoleUpdate,
} from './schemas';

function parseRpcJson<T>(data: unknown, schema: { parse: (value: unknown) => T }): T {
  if (data === null || typeof data !== 'object') throw new DomainError('INTERNAL_ERROR');
  return schema.parse(data);
}

async function callJson<T>(client: SupabaseClient, name: string, args: Record<string, unknown>, schema: { parse: (value: unknown) => T }): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw fromDatabaseError(error);
  return parseRpcJson(data, schema);
}

export async function getPermissionConfiguration(client: SupabaseClient, workspaceId: string): Promise<PermissionConfiguration> {
  await requirePermission(client, workspaceId, 'permissions.manage');
  return callJson(client, 'get_permission_configuration', { p_workspace_id: workspaceId }, PermissionConfigurationSchema);
}

export async function createPermissionRole(client: SupabaseClient, workspaceId: string, input: RoleInput) {
  await requirePermission(client, workspaceId, 'permissions.manage');
  return callJson(client, 'create_permission_role', {
    p_workspace_id: workspaceId,
    p_name: input.name,
    p_permission_keys: input.permissionKeys,
  }, PermissionRoleSchema);
}

export async function updatePermissionRole(client: SupabaseClient, workspaceId: string, roleId: string, input: RoleUpdate) {
  await requirePermission(client, workspaceId, 'permissions.manage');
  return callJson(client, 'update_permission_role', {
    p_workspace_id: workspaceId,
    p_role_id: roleId,
    p_expected_version: input.expectedVersion,
    p_name: input.name,
    p_permission_keys: input.permissionKeys,
  }, PermissionRoleSchema);
}

export async function replaceMemberOverrides(
  client: SupabaseClient,
  workspaceId: string,
  membershipId: string,
  expectedVersion: number,
  overrides: { key: string; effect: 'allow' | 'deny' }[],
) {
  await requirePermission(client, workspaceId, 'permissions.manage');
  return callJson(client, 'replace_member_permission_overrides', {
    p_workspace_id: workspaceId,
    p_membership_id: membershipId,
    p_expected_version: expectedVersion,
    p_overrides: overrides,
  }, ReplaceOverridesResultSchema);
}
