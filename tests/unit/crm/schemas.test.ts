import { describe, expect, it } from 'vitest';
import {
  CreateCompanyInputSchema,
  CreateContactInputSchema,
  UpdateCompanyInputSchema,
  UpdateContactInputSchema,
} from '@/modules/crm/schemas';

const workspaceId = '10000000-0000-4000-8000-000000000001';

describe('CRM record input schemas', () => {
  it('normalizes an explicitly international phone and email before persistence', () => {
    expect(CreateContactInputSchema.parse({
      name: '  Leila Ahmed  ',
      companyId: workspaceId,
      phone: ' +1 (202) 555-0147 ',
      email: '  LEILA@Example.Test  ',
    })).toEqual({
      name: 'Leila Ahmed',
      companyId: workspaceId,
      phone: '+12025550147',
      email: 'leila@example.test',
    });
  });

  it('rejects phones that need an unstated country code', () => {
    expect(CreateContactInputSchema.safeParse({ name: 'Leila', phone: '202-555-0147' }).success).toBe(false);
  });

  it('rejects unknown fields and unsafe website protocols', () => {
    expect(CreateContactInputSchema.safeParse({ name: 'Leila', role: 'owner' }).success).toBe(false);
    expect(CreateCompanyInputSchema.safeParse({ name: 'Example', website: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('allows explicit removal of optional contact fields and maps blank phone/email to null', () => {
    expect(UpdateContactInputSchema.parse({
      expectedVersion: 4,
      companyId: null,
      phone: '',
      email: '',
    })).toEqual({ expectedVersion: 4, companyId: null, phone: null, email: null });
  });

  it('requires an expected version and at least one changed field for edits', () => {
    expect(UpdateCompanyInputSchema.safeParse({ name: 'New name' }).success).toBe(false);
    expect(UpdateContactInputSchema.safeParse({ expectedVersion: 4 }).success).toBe(false);
  });
});
