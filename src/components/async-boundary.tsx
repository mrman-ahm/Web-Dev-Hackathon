'use client';

import type { ReactNode } from 'react';
import type { RemoteData } from '@/contracts/ui';
import { Button } from './button';

export type AsyncBoundaryProps<T> = {
  state: RemoteData<T>;
  render: (data: T) => ReactNode;
  onRetry?: () => void;
};

export function AsyncBoundary<T>({ state, render, onRetry }: AsyncBoundaryProps<T>) {
  switch (state.status) {
    case 'loading': return <div className="ub-state" role="status" aria-live="polite" aria-busy="true"><p className="ub-state-title">Loading…</p><p className="ub-muted">Fetching the latest available data.</p></div>;
    case 'empty': return <div className="ub-state" role="status"><p className="ub-state-title">No data yet</p><p className="ub-muted">Records will appear here when they are available.</p></div>;
    case 'error': return <div className="ub-state" role="alert"><p className="ub-state-title">Unable to load this view</p><p>{state.error.message}</p>{state.error.requestId && <p className="ub-muted">Reference: {state.error.requestId}</p>}{state.error.retryable && onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}</div>;
    case 'ready': return <>{render(state.data)}</>;
  }
}
