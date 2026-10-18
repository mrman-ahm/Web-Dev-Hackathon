import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthEntry } from '@/components/auth-entry';
import { AuthLayout } from '@/components/auth-layout';

export const metadata: Metadata = { title: 'Sign in · Unified Business Management', robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const { auth } = await searchParams;
  return <AuthLayout
    heading="Welcome back"
    description="Sign in to open one of your active workspaces."
    footer={<p>New to UBMP? <Link href="/signup">Create a workspace</Link></p>}
  >
    <AuthEntry
      mode="login"
      initialMessage={auth === 'confirmed' ? 'Email confirmed. Sign in to continue.' : undefined}
      initialError={auth === 'confirmation-failed' ? 'This confirmation link could not be used. Request a fresh link or sign in if your account is already active.' : undefined}
    />
  </AuthLayout>;
}
