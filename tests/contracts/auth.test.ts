import { describe, expect, it } from 'vitest';
import { AuthSessionDtoSchema, SignedOutDtoSchema, SignupResultSchema } from '@/contracts/auth';

const session = {
  user: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Amina Saleh', email: 'amina@example.test' },
  workspaces: [{
    id: '22222222-2222-4222-8222-222222222222', version: 1, name: 'Northstar Solar',
    timezone: 'Asia/Karachi', defaultCurrency: 'PKR',
  }],
};

describe('identity response contracts', () => {
  it('accepts an explicitly projected user and workspace list', () => {
    expect(AuthSessionDtoSchema.parse(session)).toEqual(session);
  });

  it('keeps confirmation-required signup separate from an authenticated session', () => {
    expect(SignupResultSchema.parse({ requiresEmailConfirmation: true })).toEqual({ requiresEmailConfirmation: true });
    expect(SignupResultSchema.parse({ requiresEmailConfirmation: false, session })).toEqual({
      requiresEmailConfirmation: false, session,
    });
    expect(SignupResultSchema.safeParse({ requiresEmailConfirmation: false }).success).toBe(false);
  });

  it('uses a precise logout result', () => {
    expect(SignedOutDtoSchema.parse({ signedOut: true })).toEqual({ signedOut: true });
    expect(SignedOutDtoSchema.safeParse({ signedOut: false }).success).toBe(false);
  });
});
