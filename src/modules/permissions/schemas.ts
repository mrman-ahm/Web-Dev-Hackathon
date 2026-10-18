import { z } from 'zod';
import { IdSchema, VersionSchema } from '../../contracts/common';

export const PermissionKeySchema = z.string().min(3).max(100).regex(/^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/);
export const PermissionKeysSchema = z.array(PermissionKeySchema).max(200).refine((keys) => new Set(keys).size === keys.length, 'Permission keys must be unique');
export const CreateRoleSchema = z.strictObject({ name: z.string().trim().min(1).max(80), permissionKeys: PermissionKeysSchema });
export const UpdateRoleSchema = CreateRoleSchema.extend({ expectedVersion: VersionSchema });
export const PermissionOverrideSchema = z.strictObject({ key: PermissionKeySchema, effect: z.enum(['allow', 'deny']) });
export const ReplaceOverridesSchema = z.strictObject({
  expectedVersion: VersionSchema,
  overrides: z.array(PermissionOverrideSchema).max(200).refine((items) => new Set(items.map((item) => item.key)).size === items.length, 'Override keys must be unique'),
});

export const PermissionRoleSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1).max(80),
  systemDefault: z.boolean(),
  permissionKeys: PermissionKeysSchema,
  version: VersionSchema,
});
export const PermissionCatalogItemSchema = z.strictObject({ key: PermissionKeySchema, description: z.string() });
export const ReplaceOverridesResultSchema = z.strictObject({
  membershipVersion: VersionSchema,
  overrides: z.array(PermissionOverrideSchema),
});
export const PermissionConfigurationSchema = z.strictObject({
  roles: z.array(PermissionRoleSchema),
  catalog: z.array(PermissionCatalogItemSchema),
});
export type PermissionRole = z.infer<typeof PermissionRoleSchema>;
export type PermissionConfiguration = z.infer<typeof PermissionConfigurationSchema>;
export type RoleInput = z.infer<typeof CreateRoleSchema>;
export type RoleUpdate = z.infer<typeof UpdateRoleSchema>;
export type OverrideInput = z.infer<typeof ReplaceOverridesSchema>;
