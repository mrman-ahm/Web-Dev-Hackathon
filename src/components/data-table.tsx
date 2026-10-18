'use client';

import { type Key, type ReactNode } from 'react';
import { Button } from './button';

export type TableColumn<T> = { id: string; header: string; cell: (row: T) => ReactNode };
export type TablePage = { index: number; size: number; totalRows: number };
export type DataTableProps<T> = {
  caption: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => Key;
  /** Zero-based page index. Core supplies the page's records and total count. */
  page: TablePage;
  onPageChange: (index: number) => void;
};

/** Presentation only: does not fetch, sort, filter, or slice a server-supplied page. */
export function DataTable<T>({ caption, columns, rows, getRowId, page, onPageChange }: DataTableProps<T>) {
  const pageCount = Math.max(1, Math.ceil(page.totalRows / Math.max(1, page.size)));
  return <div>
    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keep narrow, horizontally scrollable tables keyboard reachable. */}
    <div className="ub-table-scroll" role="region" aria-label={`${caption} table`} tabIndex={0}>
      <table className="ub-table">
        <caption>{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column.id} scope="col">{column.header}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map((row) => <tr key={getRowId(row)}>{columns.map((column) => <td key={column.id}>{column.cell(row)}</td>)}</tr>) : <tr><td colSpan={Math.max(1, columns.length)} className="ub-table-empty">No records to display.</td></tr>}</tbody>
      </table>
    </div>
    <nav className="ub-pagination" aria-label={`${caption} pagination`}>
      <p aria-live="polite">Page {page.index + 1} of {pageCount} · {page.totalRows} records</p>
      <div className="ub-row">
        <Button variant="secondary" aria-label="Previous page" disabled={page.index <= 0} onClick={() => onPageChange(page.index - 1)}>Previous</Button>
        <Button variant="secondary" aria-label="Next page" disabled={page.index >= pageCount - 1} onClick={() => onPageChange(page.index + 1)}>Next</Button>
      </div>
    </nav>
  </div>;
}
