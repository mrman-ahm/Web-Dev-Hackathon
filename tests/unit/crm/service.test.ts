import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createContact, listContacts, updateContact } from '@/modules/crm/service';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const companyId = '20000000-0000-4000-8000-000000000001';
const contactId = '30000000-0000-4000-8000-000000000001';
const membershipId = '40000000-0000-4000-8000-000000000001';

function rpcClient(results: Array<{ data: unknown; error: unknown }>) {
  const rpc = vi.fn();
  for (const result of results) rpc.mockResolvedValueOnce(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const contactRow = {
  id: contactId,
  name: 'Leila Ahmed',
  company_id: companyId,
  owner_membership_id: membershipId,
  phone_e164: '+12025550147',
  email_normalized: 'leila@example.test',
  opted_out_at: null,
  version: 1,
  created_at: '2026-10-18T12:00:00+00:00',
};

describe('CRM contact service', () => {
  it('checks current permission and sends only normalized fields to the create RPC', async () => {
    const { client, rpc } = rpcClient([
      { data: [{ key: 'crm.contacts.create' }], error: null },
      { data: [contactRow], error: null },
    ]);

    await expect(createContact(client, workspaceId, {
      name: '  Leila Ahmed ',
      companyId,
      phone: '+1 (202) 555-0147',
      email: ' LEILA@Example.Test ',
    })).resolves.toEqual({
      id: contactId,
      name: 'Leila Ahmed',
      companyId,
      ownerMembershipId: membershipId,
      phoneE164: '+12025550147',
      email: 'leila@example.test',
      optedOut: false,
      customFields: {},
      version: 1,
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'get_my_permissions', { p_workspace_id: workspaceId });
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_crm_contact', {
      p_workspace_id: workspaceId,
      p_name: 'Leila Ahmed',
      p_company_id: companyId,
      p_phone_e164: '+12025550147',
      p_email_normalized: 'leila@example.test',
    });
  });

  it('rejects malformed phone input before reading permissions or writing', async () => {
    const { client, rpc } = rpcClient([]);

    await expect(createContact(client, workspaceId, { name: 'Leila', phone: '202-555-0147' }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requests one extra row and returns a cursor for the next scoped page', async () => {
    const secondRow = { ...contactRow, id: '30000000-0000-4000-8000-000000000002', created_at: '2026-10-18T11:00:00+00:00' };
    const { client, rpc } = rpcClient([
      { data: [{ key: 'crm.contacts.view' }], error: null },
      { data: [contactRow, secondRow], error: null },
    ]);

    const page = await listContacts(client, workspaceId, { limit: 1 });

    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.id).toBe(contactId);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(rpc).toHaveBeenNthCalledWith(2, 'list_crm_contacts', {
      p_workspace_id: workspaceId,
      p_before_at: null,
      p_before_id: null,
      p_limit: 2,
    });
  });

  it('sends versioned patch fields and maps stale database edits to a safe conflict', async () => {
    const { client, rpc } = rpcClient([
      { data: [{ key: 'crm.contacts.edit' }], error: null },
      { data: null, error: { code: 'PT409', message: 'sensitive database detail' } },
    ]);

    await expect(updateContact(client, workspaceId, contactId, {
      expectedVersion: 8,
      name: 'Updated name',
      email: '',
    })).rejects.toMatchObject({ code: 'STALE_VERSION' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'update_crm_contact', {
      p_workspace_id: workspaceId,
      p_contact_id: contactId,
      p_expected_version: 8,
      p_name_set: true,
      p_name: 'Updated name',
      p_company_set: false,
      p_company_id: null,
      p_phone_set: false,
      p_phone_e164: null,
      p_email_set: true,
      p_email_normalized: null,
    });
  });
});
