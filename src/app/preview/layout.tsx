import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/styles/tokens.css';

export const metadata: Metadata = {
  title: 'Synthetic component preview · Unified Business Management',
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
