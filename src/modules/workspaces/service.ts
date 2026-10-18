import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkspaceDtoSchema, type UpdateWorkspaceInput, type WorkspaceDto } from '../../contracts/api';
import { DomainError, fromDatabaseError } from '../../lib/errors';

type WorkspaceRow = {
  id: unknown;
  name: unknown;
  timezone: unknown;
  default_currency: unknown;
  version: unknown;
};

function rows(data: unknown): unknown[] {
  if (!Array.isArray(data)) throw new DomainError('INTERNAL_ERROR');
  return data;
}

function mapWorkspace(value: unknown): WorkspaceDto {
  if (typeof value !== 'object' || value === null) throw new DomainError('INTERNAL_ERROR');
  const row = value as WorkspaceRow;
  return WorkspaceDtoSchema.parse({
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    defaultCurrency: row.default_currency,
    version: row.version,
  });
}

export async function getMyWorkspaces(client: SupabaseClient): Promise<WorkspaceDto[]> {
  const { data, error } = await client.rpc('get_my_workspaces');
  if (error) throw fromDatabaseError(error);
  return rows(data).map(mapWorkspace);
}

export async function getWorkspace(client: SupabaseClient, workspaceId: string): Promise<WorkspaceDto> {
  const { data, error } = await client.rpc('get_workspace', { p_workspace_id: workspaceId });
  if (error) throw fromDatabaseError(error);
  const result = rows(data);
  if (result.length === 0) throw new DomainError('NOT_FOUND');
  if (result.length !== 1) throw new DomainError('INTERNAL_ERROR');
  return mapWorkspace(result[0]);
}

export async function updateWorkspace(
  client: SupabaseClient,
  workspaceId: string,
  input: UpdateWorkspaceInput,
): Promise<WorkspaceDto> {
  const { data, error } = await client.rpc('update_workspace', {
    p_workspace_id: workspaceId,
    p_expected_version: input.expectedVersion,
    p_name: input.name,
    p_timezone: input.timezone,
    p_default_currency: input.defaultCurrency,
  });
  if (error) throw fromDatabaseError(error);
  const result = rows(data);
  if (result.length !== 1) throw new DomainError('INTERNAL_ERROR');
  return mapWorkspace(result[0]);
}
