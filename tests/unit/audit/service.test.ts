import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { listAuditEntries, parseAuditQuery } from '@/modules/audit/service';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const actorId = '20000000-0000-4000-8000-000000000001';
const firstId = '30000000-0000-4000-8000-000000000001';
const secondId = '30000000-0000-4000-8000-000000000002';

function auditRow(id: string, occurredAt: string) {
  return {
    id,
    event_type: 'workspace.updated',
    actor_kind: 'user',
    actor_display_name: 'Amina',
    target_type: 'workspace',
    target_id: workspaceId,
    occurred_at: occurredAt,
    before_json: { name: 'Old name' },
    after_json: { name: 'New name' },
  };
}

function clientReturning(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('listAuditEntries', () => {
  it('validates and maps rows, requests one extra row, and returns an opaque next cursor', async () => {
    const { client, rpc } = clientReturning([
      auditRow(firstId, '2026-10-18T10:02:00.123456Z'),
      auditRow(secondId, '2026-10-18T10:01:00Z'),
    ]);

    const page = await listAuditEntries(client, workspaceId, {
      eventType: 'workspace.updated',
      actor: actorId,
      from: '2026-10-18T00:00:00Z',
      to: '2026-10-19T00:00:00Z',
      limit: 1,
    });

    expect(rpc).toHaveBeenCalledWith('get_audit_entries', {
      p_workspace_id: workspaceId,
      p_event_type: 'workspace.updated',
      p_actor_membership_id: actorId,
      p_from: '2026-10-18T00:00:00Z',
      p_to: '2026-10-19T00:00:00Z',
      p_before_at: null,
      p_before_id: null,
      p_limit: 2,
    });
    expect(page.data).toEqual([{
      id: firstId,
      eventType: 'workspace.updated',
      actor: { kind: 'user', displayName: 'Amina' },
      target: { type: 'workspace', id: workspaceId },
      occurredAt: '2026-10-18T10:02:00.123Z',
      before: { name: 'Old name' },
      after: { name: 'New name' },
    }]);
    expect(page.nextCursor).toEqual(expect.any(String));

    const continuation = clientReturning([auditRow(secondId, '2026-10-18T10:01:00+00:00')]);
    await listAuditEntries(continuation.client, workspaceId, { cursor: page.nextCursor ?? undefined, limit: 1 });
    expect(continuation.rpc).toHaveBeenCalledWith('get_audit_entries', expect.objectContaining({
      p_before_at: '2026-10-18T10:02:00.123456Z',
      p_before_id: firstId,
      p_limit: 2,
    }));
  });

  it('rejects malformed cursors and reversed date windows before database access', async () => {
    const { client, rpc } = clientReturning([]);

    await expect(listAuditEntries(client, workspaceId, { cursor: 'not-a-cursor' }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(listAuditEntries(client, workspaceId, {
      from: '2026-10-19T00:00:00Z',
      to: '2026-10-18T00:00:00Z',
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps database failures to safe domain errors', async () => {
    const { client } = clientReturning(null, { code: 'PT403', message: 'private failure detail' });

    await expect(listAuditEntries(client, workspaceId, {}))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects unknown and repeated query parameters', async () => {
    const params = new URLSearchParams('eventType=workspace.updated&eventType=contact.updated');
    expect(() => parseAuditQuery(params)).toThrowError();
    expect(() => parseAuditQuery(new URLSearchParams('raw=1'))).toThrowError();
  });
});
