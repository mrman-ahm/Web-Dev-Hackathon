import { z } from 'zod';
import { AckContextSchema, AvailabilitySchema, BaseLevelSchema, CurrencySchema, IdSchema, InstantSchema, LeadSourceSchema, MoneySchema, NonemptySchema, OwnershipModeSchema, PhoneE164Schema, ProviderSchema, RecoveryReasonSchema, TimezoneSchema, VersionedSchema, VersionSchema } from './common';
export * from './common';
export const ErrorCodeSchema=z.enum(['VALIDATION_FAILED','UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','CONFLICT','STALE_VERSION','DEADLINE_EXPIRED','ASSIGNMENT_CHANGED','RATE_LIMITED','PROVIDER_UNAVAILABLE','RECONNECT_REQUIRED','INTERNAL_ERROR']);
export const ApiErrorSchema=z.strictObject({error:z.strictObject({code:ErrorCodeSchema,message:z.string().min(1),fieldErrors:z.record(z.string(),z.array(z.string())).optional(),retryable:z.boolean(),requestId:z.string().min(1)})});
export const ApiSuccessSchema=<T extends z.ZodType>(data:T)=>z.strictObject({data,meta:z.strictObject({requestId:z.string().min(1)})});
export const ApiListSchema=<T extends z.ZodType>(data:T)=>z.strictObject({data:z.array(data),meta:z.strictObject({requestId:z.string().min(1),nextCursor:z.string().nullable()})});
export const ActorContextSchema=z.strictObject({userId:IdSchema,workspaceId:IdSchema,membershipId:IdSchema});
export const UserDtoSchema=z.strictObject({id:IdSchema,displayName:NonemptySchema,email:z.email()});
export const WorkspaceDtoSchema=VersionedSchema.extend({name:NonemptySchema,timezone:TimezoneSchema,defaultCurrency:CurrencySchema});
export const MemberDtoSchema=VersionedSchema.extend({userId:IdSchema,displayName:NonemptySchema,baseLevel:BaseLevelSchema,roleId:IdSchema,status:z.enum(['active','inactive']),availability:AvailabilitySchema});
export const FieldValueSchema=z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
const CustomFieldsSchema=z.record(z.string(),FieldValueSchema);
export const ContactDtoSchema=VersionedSchema.extend({name:NonemptySchema,companyId:IdSchema.nullable(),ownerMembershipId:IdSchema.nullable(),phoneE164:PhoneE164Schema.nullable(),email:z.email().nullable(),optedOut:z.boolean(),customFields:CustomFieldsSchema});
export const CompanyDtoSchema=VersionedSchema.extend({name:NonemptySchema,website:z.url().nullable(),customFields:CustomFieldsSchema});
export const FieldDefinitionDtoSchema=VersionedSchema.extend({entityKind:z.enum(['contact','company','opportunity']),pipelineId:IdSchema.nullable(),key:z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),label:NonemptySchema,valueType:z.enum(['text','number','date','dropdown','checkbox']),options:z.array(z.strictObject({key:NonemptySchema,label:NonemptySchema}))});
export const StageDtoSchema=VersionedSchema.extend({pipelineId:IdSchema,name:NonemptySchema,position:z.number().int().nonnegative(),outcome:z.enum(['open','won','lost']),requiredFieldIds:z.array(IdSchema)});
export const PipelineDtoSchema=VersionedSchema.extend({name:NonemptySchema,stages:z.array(StageDtoSchema)});
export const ProtectedValueSchema=z.discriminatedUnion('visibility',[z.strictObject({visibility:z.literal('visible'),money:MoneySchema}),z.strictObject({visibility:z.literal('hidden')})]);
export const OpportunityDtoSchema=VersionedSchema.extend({title:NonemptySchema,contactId:IdSchema,companyId:IdSchema.nullable(),ownerMembershipId:IdSchema.nullable(),pipelineId:IdSchema,stageId:IdSchema,customFields:CustomFieldsSchema,value:ProtectedValueSchema});
export const LeadDtoSchema=VersionedSchema.extend({contactId:IdSchema,opportunityId:IdSchema.nullable(),source:LeadSourceSchema,state:z.enum(['open','closed']),accountableMembershipId:IdSchema,ownershipMode:OwnershipModeSchema,assignmentVersion:VersionSchema,assignedAt:InstantSchema.nullable(),ackDeadlineAt:InstantSchema.nullable(),acknowledgedAt:InstantSchema.nullable(),recoveryReasons:z.array(RecoveryReasonSchema)});
export const MessageDtoSchema=VersionedSchema.extend({conversationId:IdSchema,direction:z.enum(['inbound','outbound']),body:z.string().max(10000),state:z.enum(['received','pending','sent','delivered','failed','unknown']),failureCode:z.string().nullable()});
export const PaymentDtoSchema=VersionedSchema.extend({
 opportunityId:IdSchema,
 contactId:IdSchema,
 requestedBy:IdSchema,
 money:MoneySchema,
 state:z.enum(['pending','open','abandoned','expired','policy_expired','failed','paid','partially_refunded','refunded']),
 checkoutUrl:z.url({protocol:/^https$/}).nullable(),
 providerTrackerRef:z.string().min(1).max(500).nullable(),
 providerPaymentRef:z.string().min(1).max(500).nullable(),
 providerExpiresAt:InstantSchema.nullable(),
 applicationPolicyExpiresAt:InstantSchema.nullable(),
});
export const AppointmentDtoSchema=VersionedSchema.extend({contactId:IdSchema,opportunityId:IdSchema.nullable(),employeeMembershipId:IdSchema,startsAt:InstantSchema,endsAt:InstantSchema,timezone:TimezoneSchema,state:z.enum(['pending','confirmed','rescheduling','cancelling','cancelled','failed','conflict']),providerReference:z.string().nullable()}).refine(v=>v.endsAt>v.startsAt,'Appointment end must follow start');
export const IntegrationDtoSchema=VersionedSchema.extend({provider:ProviderSchema,membershipId:IdSchema.nullable(),status:z.enum(['disconnected','connected','error','reconnect_required']),lastSuccessAt:InstantSchema.nullable(),lastError:z.strictObject({code:z.string(),message:z.string()}).nullable(),limits:z.array(z.string())});
export const AuditDtoSchema=z.strictObject({id:IdSchema,eventType:NonemptySchema,actor:z.strictObject({kind:z.enum(['user','system','provider']),displayName:z.string().nullable()}),target:z.strictObject({type:NonemptySchema,id:IdSchema}),occurredAt:InstantSchema,before:z.record(z.string(),z.unknown()).nullable(),after:z.record(z.string(),z.unknown()).nullable()});
export const SignupInputSchema=z.strictObject({email:z.email().max(254),password:z.string().min(12).max(128),displayName:NonemptySchema,workspaceName:NonemptySchema,timezone:TimezoneSchema,defaultCurrency:CurrencySchema});
export const LoginInputSchema=z.strictObject({email:z.email().max(254),password:z.string().min(1).max(128)});
export const LogoutInputSchema=z.strictObject({scope:z.enum(['local','global']).default('local')});
export const UpdateWorkspaceInputSchema=z.strictObject({expectedVersion:VersionSchema,name:NonemptySchema,timezone:TimezoneSchema,defaultCurrency:CurrencySchema});
export const PaginationQuerySchema=z.strictObject({cursor:z.string().max(4096).optional(),limit:z.coerce.number().int().min(1).max(100).default(25)});
export const PendingOperationSchema=z.strictObject({operationId:IdSchema,status:z.literal('pending')});
export const AcknowledgeLeadInputSchema=z.strictObject({assignmentVersion:VersionSchema});
export const ReassignLeadInputSchema=z.strictObject({assignmentVersion:VersionSchema,targetMembershipId:IdSchema,reason:NonemptySchema});
export const RecoverLeadInputSchema=z.strictObject({assignmentVersion:VersionSchema,action:z.literal('accept_current')});
export const CreateLeadInputSchema=z.strictObject({contactId:IdSchema,opportunityId:IdSchema.optional(),source:z.literal('manual'),sourceReference:z.string().max(500).optional()});
export const SendConversationMessageInputSchema=z.strictObject({body:z.string().min(1).max(10000),ackContext:AckContextSchema.optional()});
export const CreatePaymentRequestInputSchema=z.strictObject({money:MoneySchema});
export const CreateAppointmentInputSchema=z.strictObject({contactId:IdSchema,opportunityId:IdSchema.nullable(),employeeMembershipId:IdSchema,startsAt:InstantSchema,endsAt:InstantSchema,timezone:TimezoneSchema,ackContext:AckContextSchema.optional()}).refine(v=>v.endsAt>v.startsAt,'Appointment end must follow start');
export type ErrorCode=z.infer<typeof ErrorCodeSchema>;
export type ApiError=z.infer<typeof ApiErrorSchema>;
export type ActorContext=z.infer<typeof ActorContextSchema>;
export type UserDto=z.infer<typeof UserDtoSchema>;
export type WorkspaceDto=z.infer<typeof WorkspaceDtoSchema>;
export type MemberDto=z.infer<typeof MemberDtoSchema>;
export type FieldValue=z.infer<typeof FieldValueSchema>;
export type ContactDto=z.infer<typeof ContactDtoSchema>;
export type CompanyDto=z.infer<typeof CompanyDtoSchema>;
export type FieldDefinitionDto=z.infer<typeof FieldDefinitionDtoSchema>;
export type StageDto=z.infer<typeof StageDtoSchema>;
export type PipelineDto=z.infer<typeof PipelineDtoSchema>;
export type OpportunityDto=z.infer<typeof OpportunityDtoSchema>;
export type LeadDto=z.infer<typeof LeadDtoSchema>;
export type MessageDto=z.infer<typeof MessageDtoSchema>;
export type PaymentDto=z.infer<typeof PaymentDtoSchema>;
export type AppointmentDto=z.infer<typeof AppointmentDtoSchema>;
export type IntegrationDto=z.infer<typeof IntegrationDtoSchema>;
export type AuditDto=z.infer<typeof AuditDtoSchema>;
export type SignupInput=z.infer<typeof SignupInputSchema>;
export type LoginInput=z.infer<typeof LoginInputSchema>;
export type UpdateWorkspaceInput=z.infer<typeof UpdateWorkspaceInputSchema>;
