import { describe, expect, it } from 'vitest';
import { CreateRoleSchema, ReplaceOverridesSchema } from '@/modules/permissions/schemas';

describe('permission administration inputs', () => {
  it('rejects duplicate grants and unknown request properties', () => {
    expect(CreateRoleSchema.safeParse({ name: 'Manager', permissionKeys: ['members.view', 'members.view'] }).success).toBe(false);
    expect(CreateRoleSchema.safeParse({ name: 'Manager', permissionKeys: [], isOwner: true }).success).toBe(false);
  });

  it('rejects duplicate member override keys', () => {
    expect(ReplaceOverridesSchema.safeParse({
      expectedVersion: 1,
      overrides: [{ key: 'members.view', effect: 'allow' }, { key: 'members.view', effect: 'deny' }],
    }).success).toBe(false);
  });
});
