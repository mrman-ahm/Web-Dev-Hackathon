import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import '@/styles/tokens.css';
export const metadata:Metadata={title:'Unified Business Management Platform',description:'Accountable lead management for growing service businesses.'};
export default function RootLayout({children}:{children:ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
