import { z } from 'zod';
import { UserDtoSchema, WorkspaceDtoSchema } from './api';

export { SignupInputSchema as signupInputSchema, LoginInputSchema as loginInputSchema, LogoutInputSchema as logoutInputSchema, UserDtoSchema as userDtoSchema } from './api';
export type { SignupInput, LoginInput, UserDto } from './api';

export const AuthSessionDtoSchema = z.strictObject({
  user: UserDtoSchema,
  workspaces: z.array(WorkspaceDtoSchema),
});

export const SignupResultSchema = z.discriminatedUnion('requiresEmailConfirmation', [
  z.strictObject({ requiresEmailConfirmation: z.literal(true) }),
  z.strictObject({ requiresEmailConfirmation: z.literal(false), session: AuthSessionDtoSchema }),
]);

export const SignedOutDtoSchema = z.strictObject({ signedOut: z.literal(true) });

export type AuthSessionDto = z.infer<typeof AuthSessionDtoSchema>;
export type SignupResult = z.infer<typeof SignupResultSchema>;
export type SignedOutDto = z.infer<typeof SignedOutDtoSchema>;
