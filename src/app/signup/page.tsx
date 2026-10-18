import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthEntry } from '@/components/auth-entry';
import { AuthLayout } from '@/components/auth-layout';

export const metadata: Metadata = { title: 'Create a workspace · Unified Business Management', robots: { index: false, follow: false } };

export default function SignupPage() {
  return <AuthLayout
    heading="Create your workspace"
    description="Start with your account and workspace details. Your first member is created as the Owner."
    footer={<p>Already have an account? <Link href="/login">Sign in</Link></p>}
  >
    <AuthEntry mode="signup" />
  </AuthLayout>;
}
