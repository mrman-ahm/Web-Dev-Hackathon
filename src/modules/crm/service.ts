import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  CompanyDtoSchema,
  ContactDtoSchema,
  PaginationQuerySchema,
  type CompanyDto,
  type ContactDto,
} from '@/contracts/api';
import { IdSchema, NonemptySchema, VersionSchema } from '@/contracts/common';
import { DomainError, fromDatabaseError } from '@/lib/errors';
import { requirePermission } from '@/modules/permissions/authorization';
import {
  ArchiveRecordInputSchema,
  CreateCompanyInputSchema,
  CreateContactInputSchema,
  UpdateCompanyInputSchema,
  UpdateContactInputSchema,
} from './schemas';

const DatabaseVersionSchema = z.union([
  VersionSchema,
  z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(VersionSchema),
]);

const CompanyRowSchema = z.strictObject({
  id: IdSchema,
  name: NonemptySchema,
  website: z.string().nullable(),
  version: DatabaseVersionSchema,
  created_at: z.iso.datetime({ offset: true }),
});

const ContactRowSchema = z.strictObject({
  id: IdSchema,
  name: NonemptySchema,
  company_id: IdSchema.nullable(),
  owner_membership_id: IdSchema.nullable(),
  phone_e164: z.string().nullable(),
  email_normalized: z.string().nullable(),
  opted_out_at: z.iso.datetime({ offset: true }).nullable(),
  version: DatabaseVersionSchema,
  created_at: z.iso.datetime({ offset: true }),
});

const PageCursorSchema = z.strictObject({
  version: z.literal(1),
  kind: z.enum(['company', 'contact']),
  workspaceId: IdSchema,
  id: IdSchema,
  createdAt: z.iso.datetime({ offset: true }),
});

type CompanyRow = z.infer<typeof CompanyRowSchema>;
type ContactRow = z.infer<typeof ContactRowSchema>;
type PageCursor = z.infer<typeof PageCursorSchema>;
export type CrmPage<T> = { data: T[]; nextCursor: string | null };
export type CrmListInput = { cursor?: string; limit?: number };

function parseId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED');
  return parsed.data;
}

function parseInput<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) throw new DomainError('VALIDATION_FAILED');
  return result.data;
}

function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string | undefined, kind: PageCursor['kind'], workspaceId: string): PageCursor | null {
  if (value === undefined) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new DomainError('VALIDATION_FAILED');
  try {
    const raw: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const parsed = PageCursorSchema.safeParse(raw);
    if (!parsed.success || parsed.data.kind !== kind || parsed.data.workspaceId !== workspaceId) {
      throw new DomainError('VALIDATION_FAILED');
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('VALIDATION_FAILED');
  }
}

async function rpcRows(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown[]> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw fromDatabaseError(error);
  if (!Array.isArray(data)) throw new DomainError('INTERNAL_ERROR');
  return data;
}

function parseCompanyRow(value: unknown): CompanyRow {
  const row = CompanyRowSchema.safeParse(value);
  if (!row.success) throw new DomainError('INTERNAL_ERROR');
  return row.data;
}

function parseContactRow(value: unknown): ContactRow {
  const row = ContactRowSchema.safeParse(value);
  if (!row.success) throw new DomainError('INTERNAL_ERROR');
  return row.data;
}

function toCompanyDto(rowValue: unknown): CompanyDto {
  const row = parseCompanyRow(rowValue);
  const result = CompanyDtoSchema.safeParse({
    id: row.id,
    version: row.version,
    name: row.name,
    website: row.website,
    customFields: {},
  });
  if (!result.success) throw new DomainError('INTERNAL_ERROR');
  return result.data;
}

function toContactDto(rowValue: unknown): ContactDto {
  const row = parseContactRow(rowValue);
  const result = ContactDtoSchema.safeParse({
    id: row.id,
    version: row.version,
    name: row.name,
    companyId: row.company_id,
    ownerMembershipId: row.owner_membership_id,
    phoneE164: row.phone_e164,
    email: row.email_normalized,
    optedOut: row.opted_out_at !== null,
    customFields: {},
  });
  if (!result.success) throw new DomainError('INTERNAL_ERROR');
  return result.data;
}

function parsePageInput(input: CrmListInput) {
  const parsed = PaginationQuerySchema.safeParse(input);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED');
  return parsed.data;
}

function toPage<T, R extends { id: string; created_at: string }>(
  rows: R[],
  limit: number,
  kind: PageCursor['kind'],
  workspaceId: string,
  mapper: (value: R) => T,
): CrmPage<T> {
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: pageRows.map(mapper),
    nextCursor: hasMore && last
      ? encodeCursor({ version: 1, kind, workspaceId, id: last.id, createdAt: last.created_at })
      : null,
  };
}

export function parseCrmListQuery(searchParams: URLSearchParams): CrmListInput {
  const query: Record<string, string> = {};
  const allowed = new Set(['cursor', 'limit']);
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    if (!allowed.has(key) || values.length !== 1) throw new DomainError('VALIDATION_FAILED');
    query[key] = values[0] ?? '';
  }
  const parsed = PaginationQuerySchema.safeParse(query);
  if (!parsed.success) throw new DomainError('VALIDATION_FAILED');
  return parsed.data;
}

async function readOne<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  mapper: (value: unknown) => T,
): Promise<T> {
  const rows = await rpcRows(client, name, args);
  if (rows.length === 0) throw new DomainError('NOT_FOUND');
  if (rows.length !== 1) throw new DomainError('INTERNAL_ERROR');
  return mapper(rows[0]);
}

export async function listCompanies(client: SupabaseClient, workspaceIdValue: string, input: CrmListInput = {}): Promise<CrmPage<CompanyDto>> {
  const workspaceId = parseId(workspaceIdValue);
  const pageInput = parsePageInput(input);
  const cursor = decodeCursor(pageInput.cursor, 'company', workspaceId);
  await requirePermission(client, workspaceId, 'crm.companies.view');
  const rows = await rpcRows(client, 'list_crm_companies', {
    p_workspace_id: workspaceId,
    p_before_at: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: pageInput.limit + 1,
  });
  const parsedRows = rows.map(parseCompanyRow);
  return toPage(parsedRows, pageInput.limit, 'company', workspaceId, toCompanyDto);
}

export async function getCompany(client: SupabaseClient, workspaceIdValue: string, companyIdValue: string): Promise<CompanyDto> {
  const workspaceId = parseId(workspaceIdValue);
  const companyId = parseId(companyIdValue);
  await requirePermission(client, workspaceId, 'crm.companies.view');
  return readOne(client, 'get_crm_company', { p_workspace_id: workspaceId, p_company_id: companyId }, toCompanyDto);
}

export async function createCompany(client: SupabaseClient, workspaceIdValue: string, value: unknown) {
  const workspaceId = parseId(workspaceIdValue);
  const input = parseInput(CreateCompanyInputSchema, value);
  await requirePermission(client, workspaceId, 'crm.companies.create');
  return readOne(client, 'create_crm_company', {
    p_workspace_id: workspaceId,
    p_name: input.name,
    p_website: input.website ?? null,
  }, toCompanyDto);
}

export async function updateCompany(
  client: SupabaseClient,
  workspaceIdValue: string,
  companyIdValue: string,
  value: unknown,
) {
  const workspaceId = parseId(workspaceIdValue);
  const companyId = parseId(companyIdValue);
  const input = parseInput(UpdateCompanyInputSchema, value);
  await requirePermission(client, workspaceId, 'crm.companies.edit');
  return readOne(client, 'update_crm_company', {
    p_workspace_id: workspaceId,
    p_company_id: companyId,
    p_expected_version: input.expectedVersion,
    p_name_set: Object.hasOwn(input, 'name'),
    p_name: input.name ?? null,
    p_website_set: Object.hasOwn(input, 'website'),
    p_website: input.website ?? null,
  }, toCompanyDto);
}

export async function archiveCompany(
  client: SupabaseClient,
  workspaceIdValue: string,
  companyIdValue: string,
  value: unknown,
) {
  const workspaceId = parseId(workspaceIdValue);
  const companyId = parseId(companyIdValue);
  const input = parseInput(ArchiveRecordInputSchema, value);
  await requirePermission(client, workspaceId, 'crm.companies.delete');
  return readOne(client, 'archive_crm_company', {
    p_workspace_id: workspaceId,
    p_company_id: companyId,
    p_expected_version: input.expectedVersion,
  }, toCompanyDto);
}

export async function listContacts(client: SupabaseClient, workspaceIdValue: string, input: CrmListInput = {}): Promise<CrmPage<ContactDto>> {
  const workspaceId = parseId(workspaceIdValue);
  const pageInput = parsePageInput(input);
  const cursor = decodeCursor(pageInput.cursor, 'contact', workspaceId);
  await requirePermission(client, workspaceId, 'crm.contacts.view');
  const rows = await rpcRows(client, 'list_crm_contacts', {
    p_workspace_id: workspaceId,
    p_before_at: cursor?.createdAt ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: pageInput.limit + 1,
  });
  const parsedRows = rows.map(parseContactRow);
  return toPage(parsedRows, pageInput.limit, 'contact', workspaceId, toContactDto);
}

export async function getContact(client: SupabaseClient, workspaceIdValue: string, contactIdValue: string): Promise<ContactDto> {
  const workspaceId = parseId(workspaceIdValue);
  const contactId = parseId(contactIdValue);
  await requirePermission(client, workspaceId, 'crm.contacts.view');
  return readOne(client, 'get_crm_contact', { p_workspace_id: workspaceId, p_contact_id: contactId }, toContactDto);
}

export async function createContact(client: SupabaseClient, workspaceIdValue: string, value: unknown) {
  const workspaceId = parseId(workspaceIdValue);
  const input = parseInput(CreateContactInputSchema, value);
  await requirePermission(client, workspaceId, 'crm.contacts.create');
  return readOne(client, 'create_crm_contact', {
    p_workspace_id: workspaceId,
    p_name: input.name,
    p_company_id: input.companyId ?? null,
    p_phone_e164: input.phone ?? null,
    p_email_normalized: input.email ?? null,
  }, toContactDto);
}

export async function updateContact(
  client: SupabaseClient,
  workspaceIdValue: string,
  contactIdValue: string,
  value: unknown,
) {
  const workspaceId = parseId(workspaceIdValue);
  const contactId = parseId(contactIdValue);
  const input = parseInput(UpdateContactInputSchema, value);
  await requirePermission(client, workspaceId, 'crm.contacts.edit');
  return readOne(client, 'update_crm_contact', {
    p_workspace_id: workspaceId,
    p_contact_id: contactId,
    p_expected_version: input.expectedVersion,
    p_name_set: Object.hasOwn(input, 'name'),
    p_name: input.name ?? null,
    p_company_set: Object.hasOwn(input, 'companyId'),
    p_company_id: input.companyId ?? null,
    p_phone_set: Object.hasOwn(input, 'phone'),
    p_phone_e164: input.phone ?? null,
    p_email_set: Object.hasOwn(input, 'email'),
    p_email_normalized: input.email ?? null,
  }, toContactDto);
}

export async function archiveContact(
  client: SupabaseClient,
  workspaceIdValue: string,
  contactIdValue: string,
  value: unknown,
) {
  const workspaceId = parseId(workspaceIdValue);
  const contactId = parseId(contactIdValue);
  const input = parseInput(ArchiveRecordInputSchema, value);
  await requirePermission(client, workspaceId, 'crm.contacts.delete');
  return readOne(client, 'archive_crm_contact', {
    p_workspace_id: workspaceId,
    p_contact_id: contactId,
    p_expected_version: input.expectedVersion,
  }, toContactDto);
}
