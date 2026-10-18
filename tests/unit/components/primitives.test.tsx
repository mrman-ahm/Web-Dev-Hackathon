import { createRef, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/button';
import { Input } from '@/components/input';
import { FormField } from '@/components/form-field';
import { DataTable } from '@/components/data-table';
import { Dialog } from '@/components/dialog';
import { AsyncBoundary } from '@/components/async-boundary';

describe('form primitives', () => {
  it('forwards native props and refs and never implicitly submits', async () => {
    const user = userEvent.setup();
    const clicked = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(<form><Button ref={ref} onClick={clicked}>Save view</Button></form>);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Save view' }));
    expect(ref.current).toHaveAttribute('type', 'button');
    await user.tab();
    await user.keyboard('{Enter}');
    expect(clicked).toHaveBeenCalledOnce();
  });

  it('associates labels, existing descriptions and validation errors with an input', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    render(<><p id="extra">Work email only.</p><FormField label="Email" description="Use your business address." error="Enter a valid email."><Input ref={ref} name="email" type="email" aria-describedby="extra" /></FormField></>);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Work email only. Use your business address. Enter a valid email.');
    await user.click(screen.getByText('Email'));
    expect(input).toHaveFocus();
  });

  it('retains caller IDs and required native semantics', () => {
    render(<FormField label="Company"><Input id="company-name" required /></FormField>);
    expect(screen.getByRole('textbox', { name: 'Company' })).toHaveAttribute('id', 'company-name');
    expect(screen.getByRole('textbox', { name: 'Company' })).toBeRequired();
  });
});

describe('DataTable', () => {
  it('uses semantic headers and reports bounded pagination without re-sorting rows', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<DataTable caption="Team availability" columns={[{ id: 'name', header: 'Employee', cell: (row: { id: string; name: string }) => row.name }]} rows={[{ id: 'a', name: 'Amina' }]} getRowId={(row) => row.id} page={{ index: 0, size: 10, totalRows: 21 }} onPageChange={onPageChange} />);
    expect(screen.getByRole('columnheader', { name: 'Employee' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Amina' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    expect(screen.getByText('Page 1 of 3 · 21 records')).toBeInTheDocument();
  });

  it('shows a useful empty row and disables pagination when no records exist', () => {
    render(<DataTable caption="Leads" columns={[{ id: 'name', header: 'Name', cell: (row: string) => row }]} rows={[]} getRowId={(row) => row} page={{ index: 0, size: 10, totalRows: 0 }} onPageChange={vi.fn()} />);
    expect(screen.getByText('No records to display.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
});

describe('Dialog', () => {
  it('labels its modal, contains keyboard focus, dismisses on Escape and restores focus', async () => {
    const user = userEvent.setup();
    function Example() {
      const [open, setOpen] = useState(false);
      return <><Button onClick={() => setOpen(true)}>Edit view</Button><Dialog open={open} onOpenChange={setOpen} title="Edit saved view" description="Choose the name for this view."><FormField label="View name"><Input /></FormField><Button onClick={() => setOpen(false)}>Save name</Button></Dialog></>;
    }
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Edit view' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Edit saved view' });
    expect(dialog).toHaveAccessibleDescription('Choose the name for this view.');
    expect(within(dialog).getByRole('textbox', { name: 'View name' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('AsyncBoundary', () => {
  it('distinguishes loading, empty, permanent failure, retryable failure and ready data', async () => {
    const retry = vi.fn();
    const renderData = (value: string) => <p>{value}</p>;
    const { rerender } = render(<AsyncBoundary state={{ status: 'loading' }} render={renderData} onRetry={retry} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    rerender(<AsyncBoundary state={{ status: 'empty' }} render={renderData} onRetry={retry} />);
    expect(screen.getByRole('status')).toHaveTextContent('No data yet');
    rerender(<AsyncBoundary state={{ status: 'error', error: { code: 'FORBIDDEN', message: 'Access denied.', retryable: false } }} render={renderData} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Access denied.');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    rerender(<AsyncBoundary state={{ status: 'error', error: { code: 'UNAVAILABLE', message: 'Please retry.', retryable: true, requestId: 'req-42' } }} render={renderData} onRetry={retry} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText('Reference: req-42')).toBeInTheDocument();
    rerender(<AsyncBoundary state={{ status: 'ready', data: 'Actual supplied value' }} render={renderData} />);
    expect(screen.getByText('Actual supplied value')).toBeInTheDocument();
  });
});
