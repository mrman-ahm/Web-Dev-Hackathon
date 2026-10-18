import { z } from 'zod';
import { IdSchema, NonemptySchema, PhoneE164Schema, VersionSchema } from '@/contracts/common';

const WebsiteInputSchema = z.union([
  z.literal(''),
  z.null(),
  z.string().trim().max(2048).url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }),
]).transform((value) => value === '' ? null : value);

const EmailInputSchema = z.union([
  z.literal(''),
  z.null(),
  z.string().trim().max(254).email(),
]).transform((value) => value === '' || value === null ? null : value.toLowerCase());

const PhoneInputSchema = z.union([
  z.string().trim().max(40).regex(/^[+0-9().\s-]*$/),
  z.null(),
]).transform((value, context) => {
  if (value === null || value === '') return null;

  const compact = value.replace(/[ ().\s-]/g, '');
  const e164 = compact.startsWith('+')
    ? compact
    : compact.startsWith('00')
      ? `+${compact.slice(2)}`
      : null;
  const parsed = PhoneE164Schema.safeParse(e164);
  if (!parsed.success) {
    context.addIssue({
      code: 'custom',
      message: 'Use an international number with a country calling code.',
    });
    return z.NEVER;
  }
  return parsed.data;
});

export const CreateCompanyInputSchema = z.strictObject({
  name: NonemptySchema,
  website: WebsiteInputSchema.optional(),
});

export const UpdateCompanyInputSchema = z.strictObject({
  expectedVersion: VersionSchema,
  name: NonemptySchema.optional(),
  website: WebsiteInputSchema.optional(),
}).refine((input) => Object.keys(input).some((key) => key !== 'expectedVersion'));

export const CreateContactInputSchema = z.strictObject({
  name: NonemptySchema,
  companyId: IdSchema.nullable().optional(),
  phone: PhoneInputSchema.optional(),
  email: EmailInputSchema.optional(),
});

export const UpdateContactInputSchema = z.strictObject({
  expectedVersion: VersionSchema,
  name: NonemptySchema.optional(),
  companyId: IdSchema.nullable().optional(),
  phone: PhoneInputSchema.optional(),
  email: EmailInputSchema.optional(),
}).refine((input) => Object.keys(input).some((key) => key !== 'expectedVersion'));

export const ArchiveRecordInputSchema = z.strictObject({ expectedVersion: VersionSchema });

export type CreateCompanyInput = z.infer<typeof CreateCompanyInputSchema>;
export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInputSchema>;
export type CreateContactInput = z.infer<typeof CreateContactInputSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactInputSchema>;
