'use client';

import { useState, type FormEvent } from 'react';
import {
  ApiErrorSchema,
  ApiListSchema,
  ApiSuccessSchema,
  CompanyDtoSchema,
  ContactDtoSchema,
  type CompanyDto,
  type ContactDto,
  type UserDto,
  type WorkspaceDto,
} from '@/contracts/api';
import { Button } from './button';
import { FormField } from './form-field';
import { Input } from './input';
import { SignOutButton } from './sign-out-button';
import styles from './crm-records.module.css';

type Props = {
  user: UserDto;
  workspace: WorkspaceDto;
  permissions: string[];
  initialCompanies: CompanyDto[];
  initialCompanyCursor: string | null;
  initialContacts: ContactDto[];
  initialContactCursor: string | null;
};

class ApiFailure extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

async function requestRecord<T extends CompanyDto | ContactDto>(url: string, method: string, body: unknown, schema: typeof CompanyDtoSchema | typeof ContactDtoSchema): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(payload);
    throw new ApiFailure(
      parsedError.success ? parsedError.data.error.message : 'The record could not be saved.',
      parsedError.success ? parsedError.data.error.code : 'INTERNAL_ERROR',
    );
  }
  const parsed = ApiSuccessSchema(schema).safeParse(payload);
  if (!parsed.success) throw new ApiFailure('The server returned an unexpected record.', 'INTERNAL_ERROR');
  return parsed.data.data as T;
}

async function loadRecords<T extends CompanyDto | ContactDto>(url: string, schema: typeof CompanyDtoSchema | typeof ContactDtoSchema): Promise<{ data: T[]; nextCursor: string | null }> {
  const response = await fetch(url);
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(payload);
    throw new ApiFailure(parsedError.success ? parsedError.data.error.message : 'Records could not be loaded.', parsedError.success ? parsedError.data.error.code : 'INTERNAL_ERROR');
  }
  const parsed = ApiListSchema(schema).safeParse(payload);
  if (!parsed.success) throw new ApiFailure('The server returned an unexpected record list.', 'INTERNAL_ERROR');
  return { data: parsed.data.data as T[], nextCursor: parsed.data.meta.nextCursor };
}

function errorText(error: unknown): string {
  if (error instanceof ApiFailure && error.code === 'STALE_VERSION') return 'This record changed elsewhere. Reload to get the latest version before editing.';
  if (error instanceof ApiFailure) return error.message;
  return 'The service could not be reached. Check your connection and try again.';
}

export function CrmRecords({ user, workspace, permissions, initialCompanies, initialCompanyCursor, initialContacts, initialContactCursor }: Props) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [contacts, setContacts] = useState(initialContacts);
  const [companyCursor, setCompanyCursor] = useState(initialCompanyCursor);
  const [contactCursor, setContactCursor] = useState(initialContactCursor);
  const [editing, setEditing] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const can = (permission: string) => permissions.includes(permission);
  const apiBase = `/api/v1/workspaces/${workspace.id}`;

  async function perform<T>(key: string, operation: () => Promise<T>, onSuccess: (value: T) => void, message: string) {
    setBusy(key);
    setError('');
    setStatus('');
    try {
      const result = await operation();
      onSuccess(result);
      if (message) setStatus(message);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy('');
    }
  }

  async function submitCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const result = await requestRecord<CompanyDto>(`${apiBase}/companies`, 'POST', {
      name: form.get('name'), website: form.get('website'),
    }, CompanyDtoSchema);
    setCompanies((records) => [result, ...records]);
    formElement.reset();
    setStatus('Company created.');
    setError('');
  }

  async function submitCreateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const result = await requestRecord<ContactDto>(`${apiBase}/contacts`, 'POST', {
      name: form.get('name'), companyId: form.get('companyId') || null,
      phone: form.get('phone'), email: form.get('email'),
    }, ContactDtoSchema);
    setContacts((records) => [result, ...records]);
    formElement.reset();
    setStatus('Contact created.');
    setError('');
  }

  async function submitEditCompany(event: FormEvent<HTMLFormElement>, company: CompanyDto) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await requestRecord<CompanyDto>(`${apiBase}/companies/${company.id}`, 'PATCH', {
      expectedVersion: company.version, name: form.get('name'), website: form.get('website'),
    }, CompanyDtoSchema);
    setCompanies((records) => records.map((record) => record.id === result.id ? result : record));
    setEditing('');
    setStatus('Company changes saved.');
    setError('');
  }

  async function submitEditContact(event: FormEvent<HTMLFormElement>, contact: ContactDto) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await requestRecord<ContactDto>(`${apiBase}/contacts/${contact.id}`, 'PATCH', {
      expectedVersion: contact.version, name: form.get('name'), companyId: form.get('companyId') || null,
      phone: form.get('phone'), email: form.get('email'),
    }, ContactDtoSchema);
    setContacts((records) => records.map((record) => record.id === result.id ? result : record));
    setEditing('');
    setStatus('Contact changes saved.');
    setError('');
  }

  async function archiveCompany(company: CompanyDto) {
    if (!window.confirm(`Archive ${company.name}? Active contacts must be archived first.`)) return;
    await perform(`company:${company.id}`, () => requestRecord<CompanyDto>(`${apiBase}/companies/${company.id}`, 'DELETE', { expectedVersion: company.version }, CompanyDtoSchema),
      () => setCompanies((records) => records.filter((record) => record.id !== company.id)), 'Company archived.');
  }

  async function archiveContact(contact: ContactDto) {
    if (!window.confirm(`Archive ${contact.name}?`)) return;
    await perform(`contact:${contact.id}`, () => requestRecord<ContactDto>(`${apiBase}/contacts/${contact.id}`, 'DELETE', { expectedVersion: contact.version }, ContactDtoSchema),
      () => setContacts((records) => records.filter((record) => record.id !== contact.id)), 'Contact archived.');
  }

  async function loadMore(kind: 'companies' | 'contacts') {
    const cursor = kind === 'companies' ? companyCursor : contactCursor;
    if (!cursor) return;
    const schema = kind === 'companies' ? CompanyDtoSchema : ContactDtoSchema;
    await perform(`more:${kind}`, () => loadRecords(`${apiBase}/${kind}?limit=50&cursor=${encodeURIComponent(cursor)}`, schema), (page) => {
      if (kind === 'companies') {
        setCompanies((records) => [...records, ...(page as { data: CompanyDto[] }).data]);
        setCompanyCursor((page as { nextCursor: string | null }).nextCursor);
      } else {
        setContacts((records) => [...records, ...(page as { data: ContactDto[] }).data]);
        setContactCursor((page as { nextCursor: string | null }).nextCursor);
      }
    }, 'More records loaded.');
  }

  return <div className="ub-workspace-shell">
    <a href="#crm-content" className="ub-skip">Skip to CRM records</a>
    <header className="ub-workspace-header">
      <div><p className="ub-eyebrow">Unified Business Management</p><p className="ub-workspace-name">{workspace.name}</p></div>
      <nav className={styles.headerNav} aria-label="Workspace navigation">
        <a href={`/workspaces/${workspace.id}/settings`}>Settings</a>
        <span>{user.displayName}</span>
        <SignOutButton />
      </nav>
    </header>
    <main id="crm-content" className={`ub-workspace-main ${styles.main}`} tabIndex={-1}>
      <div className={styles.heading}>
        <div><p className="ub-eyebrow">Workspace CRM</p><h1>Companies and contacts</h1><p className="ub-muted">Records are scoped to this workspace and checked against your current permissions.</p></div>
        <a className="ub-button" href={`/workspaces/${workspace.id}/settings`}>Workspace settings</a>
      </div>
      {(error || status) && <div className={error ? 'ub-auth-error' : 'ub-auth-message'} role={error ? 'alert' : 'status'} aria-live="polite">
        <p>{error || status}</p>{error.includes('Reload') && <Button variant="secondary" onClick={() => window.location.reload()}>Reload records</Button>}
      </div>}
      <div className={styles.columns}>
        <section className="ub-panel ub-stack" aria-labelledby="companies-heading">
          <div className={styles.sectionHeading}><div><p className="ub-eyebrow">Organizations</p><h2 id="companies-heading">Companies</h2></div><span className={styles.count}>{companies.length}</span></div>
          {can('crm.companies.create') && <form className={styles.createForm} onSubmit={(event) => void perform('create-company', () => submitCreateCompany(event), () => undefined, '')} aria-busy={busy === 'create-company'}>
            <h3>Add a company</h3>
            <FormField label="Company name"><Input name="name" required maxLength={200} /></FormField>
            <FormField label="Website" description="Optional. Use an https:// or http:// address."><Input name="website" type="url" maxLength={2048} /></FormField>
            <Button type="submit" disabled={Boolean(busy)}>{busy === 'create-company' ? 'Adding…' : 'Add company'}</Button>
          </form>}
          {!can('crm.companies.view') ? <div className="ub-state"><p className="ub-state-title">Company access is restricted</p><p className="ub-muted">Your current workspace permissions do not include company records.</p></div> : companies.length === 0 ? <div className="ub-state"><p className="ub-state-title">No companies yet</p><p className="ub-muted">Companies created in this workspace will appear here.</p></div> : <div className={styles.recordList}>
            {companies.map((company) => <article className={styles.record} key={company.id}>
              {editing === `company:${company.id}` ? <form className={styles.editForm} onSubmit={(event) => void perform(`company:${company.id}`, () => submitEditCompany(event, company), () => undefined, '')}>
                <FormField label="Company name"><Input name="name" defaultValue={company.name} required maxLength={200} /></FormField>
                <FormField label="Website"><Input name="website" type="url" defaultValue={company.website ?? ''} maxLength={2048} /></FormField>
                <div className="ub-row"><Button type="submit" disabled={Boolean(busy)}>Save company</Button><Button variant="secondary" onClick={() => setEditing('')}>Cancel</Button></div>
              </form> : <>
                <div className={styles.recordHeading}><h3>{company.name}</h3><span>v{company.version}</span></div>
                {company.website ? <a href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : <p className="ub-muted">No website</p>}
                <div className="ub-row">
                  {can('crm.companies.edit') && <Button variant="secondary" onClick={() => setEditing(`company:${company.id}`)}>Edit</Button>}
                  {can('crm.companies.delete') && <Button variant="secondary" onClick={() => void archiveCompany(company)} disabled={Boolean(busy)}>Archive</Button>}
                </div>
              </>}
            </article>)}
          </div>}
          {companyCursor && <Button variant="secondary" onClick={() => void loadMore('companies')} disabled={Boolean(busy)}>{busy === 'more:companies' ? 'Loading…' : 'Load more companies'}</Button>}
        </section>

        <section className="ub-panel ub-stack" aria-labelledby="contacts-heading">
          <div className={styles.sectionHeading}><div><p className="ub-eyebrow">People</p><h2 id="contacts-heading">Contacts</h2></div><span className={styles.count}>{contacts.length}</span></div>
          {can('crm.contacts.create') && <form className={styles.createForm} onSubmit={(event) => void perform('create-contact', () => submitCreateContact(event), () => undefined, '')} aria-busy={busy === 'create-contact'}>
            <h3>Add a contact</h3>
            <FormField label="Contact name"><Input name="name" required maxLength={200} /></FormField>
            <FormField label="Phone" description="Enter an international number, for example +1 202 555 0147."><Input name="phone" type="tel" maxLength={40} /></FormField>
            <FormField label="Email"><Input name="email" type="email" maxLength={254} /></FormField>
            <label className={styles.selectField} htmlFor="new-contact-company">Company<select id="new-contact-company" name="companyId" defaultValue=""><option value="">No company</option>{companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>
            <Button type="submit" disabled={Boolean(busy)}>{busy === 'create-contact' ? 'Adding…' : 'Add contact'}</Button>
          </form>}
          {!can('crm.contacts.view') ? <div className="ub-state"><p className="ub-state-title">Contact access is restricted</p><p className="ub-muted">Your current workspace permissions do not include contact records.</p></div> : contacts.length === 0 ? <div className="ub-state"><p className="ub-state-title">No contacts yet</p><p className="ub-muted">Contacts created in this workspace will appear here.</p></div> : <div className={styles.recordList}>
            {contacts.map((contact) => <article className={styles.record} key={contact.id}>
              {editing === `contact:${contact.id}` ? <form className={styles.editForm} onSubmit={(event) => void perform(`contact:${contact.id}`, () => submitEditContact(event, contact), () => undefined, '')}>
                <FormField label="Contact name"><Input name="name" defaultValue={contact.name} required maxLength={200} /></FormField>
                <FormField label="Phone"><Input name="phone" type="tel" defaultValue={contact.phoneE164 ?? ''} maxLength={40} /></FormField>
                <FormField label="Email"><Input name="email" type="email" defaultValue={contact.email ?? ''} maxLength={254} /></FormField>
                <label className={styles.selectField}>Company<select name="companyId" defaultValue={contact.companyId ?? ''}><option value="">No company</option>{companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>
                <div className="ub-row"><Button type="submit" disabled={Boolean(busy)}>Save contact</Button><Button variant="secondary" onClick={() => setEditing('')}>Cancel</Button></div>
              </form> : <>
                <div className={styles.recordHeading}><h3>{contact.name}</h3><span>v{contact.version}</span></div>
                <dl className={styles.contactDetails}>
                  <div><dt>Phone</dt><dd>{contact.phoneE164 || 'Not provided'}</dd></div>
                  <div><dt>Email</dt><dd>{contact.email || 'Not provided'}</dd></div>
                  <div><dt>Company</dt><dd>{companies.find((company) => company.id === contact.companyId)?.name ?? (contact.companyId ? 'Company not visible' : 'No company')}</dd></div>
                </dl>
                <div className="ub-row">
                  {can('crm.contacts.edit') && <Button variant="secondary" onClick={() => setEditing(`contact:${contact.id}`)}>Edit</Button>}
                  {can('crm.contacts.delete') && <Button variant="secondary" onClick={() => void archiveContact(contact)} disabled={Boolean(busy)}>Archive</Button>}
                </div>
              </>}
            </article>)}
          </div>}
          {contactCursor && <Button variant="secondary" onClick={() => void loadMore('contacts')} disabled={Boolean(busy)}>{busy === 'more:contacts' ? 'Loading…' : 'Load more contacts'}</Button>}
        </section>
      </div>
    </main>
  </div>;
}
