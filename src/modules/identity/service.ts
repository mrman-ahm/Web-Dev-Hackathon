import type { SupabaseClient, User } from '@supabase/supabase-js';
import { AuthSessionDtoSchema, SignupResultSchema, SignedOutDtoSchema, type AuthSessionDto } from '../../contracts/auth';
import { LoginInputSchema, LogoutInputSchema, SignupInputSchema, UserDtoSchema, type SignupInput } from '../../contracts/api';
import { DomainError, fromDatabaseError } from '../../lib/errors';
import { getMyWorkspaces } from '../workspaces/service';

type LoginInput = ReturnType<typeof LoginInputSchema.parse>;
type LogoutInput = ReturnType<typeof LogoutInputSchema.parse>;

function authFailure(error: { status?: number }, operation: 'signup' | 'login' | 'session' | 'logout'): DomainError {
  if (error.status === 429) return new DomainError('RATE_LIMITED');
  if (error.status === undefined || error.status >= 500) return new DomainError('PROVIDER_UNAVAILABLE');
  if (operation === 'login' || operation === 'session') return new DomainError('UNAUTHENTICATED');
  if (operation === 'logout' && (error.status === 401 || error.status === 403)) return new DomainError('UNAUTHENTICATED');
  return new DomainError('VALIDATION_FAILED');
}

function toUserDto(user: User) {
  if (!user.email) throw new DomainError('INTERNAL_ERROR');
  const rawName = user.user_metadata?.display_name;
  const displayName = typeof rawName === 'string' && rawName.trim()
    ? rawName.trim().slice(0, 120)
    : user.email.split('@')[0] || 'Workspace member';
  return UserDtoSchema.parse({ id: user.id, displayName, email: user.email });
}

/** Verify the cookie with Auth, then enforce database session revocation before protected reads. */
export async function requireActiveUser(client: SupabaseClient): Promise<User> {
  const { data, error } = await client.auth.getUser();
  if (error) throw authFailure(error, 'session');
  if (!data.user) throw new DomainError('UNAUTHENTICATED');

  const { data: active, error: sessionError } = await client.rpc('has_active_session');
  if (sessionError) throw fromDatabaseError(sessionError);
  if (active !== true) throw new DomainError('UNAUTHENTICATED');
  return data.user;
}

export async function getAuthSession(client: SupabaseClient): Promise<AuthSessionDto> {
  const user = await requireActiveUser(client);
  return AuthSessionDtoSchema.parse({ user: toUserDto(user), workspaces: await getMyWorkspaces(client) });
}

export async function signUpWithPassword(client: SupabaseClient, input: SignupInput, appOrigin: string) {
  const parsed = SignupInputSchema.parse(input);
  const { data, error } = await client.auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: {
      data: {
        display_name: parsed.displayName,
        workspace_name: parsed.workspaceName,
        timezone: parsed.timezone,
        default_currency: parsed.defaultCurrency,
      },
      emailRedirectTo: `${appOrigin}/auth/callback`,
    },
  });
  if (error) throw authFailure(error, 'signup');

  // Auth may require an email confirmation. Do not manufacture a session or workspace result.
  if (!data.session) return SignupResultSchema.parse({ requiresEmailConfirmation: true });
  if (!data.user) throw new DomainError('INTERNAL_ERROR');
  return SignupResultSchema.parse({ requiresEmailConfirmation: false, session: await getAuthSession(client) });
}

export async function signInWithPassword(client: SupabaseClient, input: LoginInput): Promise<AuthSessionDto> {
  const { error } = await client.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error) throw authFailure(error, 'login');
  return getAuthSession(client);
}

export async function signOut(client: SupabaseClient, input: LogoutInput) {
  const { error } = await client.auth.signOut({ scope: input.scope });
  if (error) throw authFailure(error, 'logout');
  return SignedOutDtoSchema.parse({ signedOut: true });
}
