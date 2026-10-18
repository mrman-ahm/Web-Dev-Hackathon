import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuditDtoSchema, AuditQuerySchema, IdSchema, type AuditDto, type AuditQuery } from '../../contracts/api';
import { DomainError, fromDatabaseError } from '../../lib/errors';

const AuditCursorSchema = z.strictObject({
  version: z.literal(1),
  id: IdSchema,
  occurredAt: z.iso.datetime({ offset: true }),
});
const AuditRowSchema = z.strictObject({
  id: IdSchema,
  event_type: z.string().min(1),
  actor_kind: z.enum(['user', 'system', 'provider']),
  actor_display_name: z.string().nullable(),
  target_type: z.string().min(1),
  target_id: IdSchema,
  occurred_at: z.iso.datetime({ offset: true }),
  before_json: z.record(z.string(), z.unknown()).nullable(),
  after_json: z.record(z.string(), z.unknown()).nullable(),
});

type AuditCursor = {
  version: 1;
  id: string;
  occurredAt: string;
};

type AuditRow = {
  id: string;
  event_type: string;
  actor_kind: 'user' | 'system' | 'provider';
  actor_display_name: string | null;
  target_type: string;
  target_id: string;
  occurred_at: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
};

export type AuditPage = { data: AuditDto[]; nextCursor: string | null };

function encodeCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string | undefined): AuditCursor | null {
  if (value === undefined) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new DomainError('VALIDATION_FAILED');
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const result = AuditCursorSchema.safeParse(decoded);
    if (!result.success) throw new DomainError('VALIDATION_FAILED');
    return result.data;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('VALIDATION_FAILED');
  }
}

function mapAuditRow(value: unknown): AuditRow {
  const result = AuditRowSchema.safeParse(value);
  if (!result.success) throw new DomainError('INTERNAL_ERROR');
  return result.data;
}

function toAuditDto(row: AuditRow): AuditDto {
  try {
    return AuditDtoSchema.parse({
      id: row.id,
      eventType: row.event_type,
      actor: { kind: row.actor_kind, displayName: row.actor_display_name },
      target: { type: row.target_type, id: row.target_id },
      occurredAt: new Date(row.occurred_at).toISOString(),
      before: row.before_json,
      after: row.after_json,
    });
  } catch {
    throw new DomainError('INTERNAL_ERROR');
  }
}

export async function listAuditEntries(
  client: SupabaseClient,
  workspaceId: string,
  input: Partial<AuditQuery>,
): Promise<AuditPage> {
  const workspace = IdSchema.safeParse(workspaceId);
  const query = AuditQuerySchema.safeParse(input);
  if (!workspace.success || !query.success) throw new DomainError('VALIDATION_FAILED');
  const cursor = decodeCursor(query.data.cursor);

  const { data, error } = await client.rpc('get_audit_entries', {
    p_workspace_id: workspace.data,
    p_event_type: query.data.eventType ?? null,
    p_actor_membership_id: query.data.actor ?? null,
    p_from: query.data.from ?? null,
    p_to: query.data.to ?? null,
    p_before_at: cursor?.occurredAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: query.data.limit + 1,
  });
  if (error) throw fromDatabaseError(error);
  if (!Array.isArray(data)) throw new DomainError('INTERNAL_ERROR');

  const rows = data.map(mapAuditRow);
  const hasMore = rows.length > query.data.limit;
  const pageRows = rows.slice(0, query.data.limit);
  const last = pageRows.at(-1);
  return {
    data: pageRows.map(toAuditDto),
    nextCursor: hasMore && last ? encodeCursor({
      version: 1,
      id: last.id,
      occurredAt: last.occurred_at,
    }) : null,
  };
}

export function parseAuditQuery(searchParams: URLSearchParams): AuditQuery {
  const query: Record<string, string> = {};
  const allowed = new Set(['eventType', 'actor', 'from', 'to', 'cursor', 'limit']);
  for (const key of new Set(searchParams.keys())) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) throw new DomainError('VALIDATION_FAILED');
    query[key] = searchParams.get(key) ?? '';
  }
  const result = AuditQuerySchema.safeParse(query);
  if (!result.success) throw new DomainError('VALIDATION_FAILED');
  return result.data;
}
