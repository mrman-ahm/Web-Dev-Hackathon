'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
import { Button } from './button';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
};

/** Radix owns modal focus, Escape, outside dismissal, and inert background behavior. */
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="ub-dialog-overlay" />
      <RadixDialog.Content className="ub-dialog"
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); }
        }}>
        <RadixDialog.Title>{title}</RadixDialog.Title>
        <RadixDialog.Description className="ub-dialog-description">{description}</RadixDialog.Description>
        {children}
        <RadixDialog.Close asChild><Button variant="secondary" className="ub-dialog-close">Close dialog</Button></RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>;
}
