import { z } from 'zod';
import { BaseLevelSchema, CurrencySchema, IdSchema, InstantSchema, InternalHrefSchema, LeadSourceSchema, MoneySchema, MoneyTotalSchema, OwnershipModeSchema, RecoveryReasonSchema, TimezoneSchema } from './common';
export { MoneySchema, MoneyTotalSchema } from './common';
export type { BaseLevel, Money, MoneyTotal } from './common';
export const AuthenticatedUserSchema = z.strictObject({id:IdSchema,displayName:z.string().min(1),email:z.email()});
export const WorkspaceSummarySchema = z.strictObject({id:IdSchema,name:z.string().min(1),timezone:TimezoneSchema,defaultCurrency:CurrencySchema});
export const NavigationItemSchema = z.strictObject({id:z.string().min(1),label:z.string().min(1),href:InternalHrefSchema,icon:z.string().min(1),enabled:z.boolean()});
export const SessionViewSchema = z.strictObject({user:AuthenticatedUserSchema,workspace:WorkspaceSummarySchema,membershipId:IdSchema,baseLevel:BaseLevelSchema,navigation:z.array(NavigationItemSchema)});
export const UiErrorSchema = z.strictObject({code:z.string().min(1),message:z.string().min(1),retryable:z.boolean(),requestId:z.string().min(1).optional()});
export const RemoteDataSchema = <T extends z.ZodType>(data:T) => z.discriminatedUnion('status',[
 z.strictObject({status:z.literal('loading')}),z.strictObject({status:z.literal('error'),error:UiErrorSchema}),
 z.strictObject({status:z.literal('empty')}),z.strictObject({status:z.literal('ready'),data}),
]);
const CountSchema=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const TotalsSchema=z.array(MoneyTotalSchema).refine(values=>new Set(values.map(v=>v.currency)).size===values.length,'One total per currency');
export const MetricValueSchema = z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('count'),value:CountSchema}),
 z.strictObject({kind:z.literal('duration'),seconds:z.number().nonnegative().nullable()}),
 z.strictObject({kind:z.literal('money'),totals:TotalsSchema}),
 z.strictObject({kind:z.literal('statusCounts'),counts:z.record(z.string(),CountSchema)}),
]);
export const DashboardMetricIdSchema = z.enum(['new_leads_today','open_pipeline_value','first_response_seconds','recovery_count','escalations_24h','availability','upcoming_appointments','payments_month','net_collections_month']);
const metricBase={id:DashboardMetricIdSchema,label:z.string().min(1)};
export const DashboardMetricSchema=z.discriminatedUnion('visibility',[
 z.strictObject({...metricBase,visibility:z.literal('visible'),value:MetricValueSchema,drilldownHref:InternalHrefSchema.nullable()}),
 z.strictObject({...metricBase,visibility:z.literal('restricted')}),
]);
export const PipelineStageValueSchema=z.strictObject({stageId:IdSchema,stageName:z.string().min(1),totals:TotalsSchema});
export const PipelineTotalsSchema=z.discriminatedUnion('visibility',[
 z.strictObject({visibility:z.literal('visible'),stages:z.array(PipelineStageValueSchema)}),
 z.strictObject({visibility:z.literal('restricted')}),
]);
export const AppointmentSummarySchema=z.strictObject({id:IdSchema,contactName:z.string().min(1),employeeName:z.string().min(1),startsAt:InstantSchema,endsAt:InstantSchema,timezone:TimezoneSchema,status:z.string().min(1)}).refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt),'Appointment end must follow start');
export const DashboardSnapshotSchema=z.strictObject({scope:z.enum(['personal','company']),workspaceId:IdSchema,asOf:InstantSchema,timezone:TimezoneSchema,metrics:z.array(DashboardMetricSchema),openPipelineByStage:PipelineTotalsSchema,upcomingAppointments:z.array(AppointmentSummarySchema),collections:z.discriminatedUnion('visibility',[z.strictObject({visibility:z.literal('visible'),grossPayments:z.array(MoneySchema),confirmedRefunds:z.array(MoneySchema),netCollected:TotalsSchema}),z.strictObject({visibility:z.literal('restricted')})])});
export const ContactSummarySchema=z.strictObject({id:IdSchema,name:z.string().min(1),companyName:z.string().nullable(),ownerName:z.string().nullable()});
export const LeadSummarySchema=z.strictObject({id:IdSchema,contact:ContactSummarySchema,source:LeadSourceSchema,ownerName:z.string().min(1),ownershipMode:OwnershipModeSchema,ackDeadlineAt:InstantSchema.nullable(),recoveryReasons:z.array(RecoveryReasonSchema)});
export type AuthenticatedUser=z.infer<typeof AuthenticatedUserSchema>;
export type WorkspaceSummary=z.infer<typeof WorkspaceSummarySchema>;
export type NavigationItem=z.infer<typeof NavigationItemSchema>;
export type SessionView=z.infer<typeof SessionViewSchema>;
export type UiError=z.infer<typeof UiErrorSchema>;
export type RemoteData<T>=z.infer<ReturnType<typeof RemoteDataSchema<z.ZodType<T>>>>;
export type MetricValue=z.infer<typeof MetricValueSchema>;
export type DashboardMetricId=z.infer<typeof DashboardMetricIdSchema>;
export type DashboardMetric=z.infer<typeof DashboardMetricSchema>;
export type PipelineStageValue=z.infer<typeof PipelineStageValueSchema>;
export type PipelineTotals=z.infer<typeof PipelineTotalsSchema>;
export type DashboardSnapshot=z.infer<typeof DashboardSnapshotSchema>;
export type AppointmentSummary=z.infer<typeof AppointmentSummarySchema>;
export type ContactSummary=z.infer<typeof ContactSummarySchema>;
export type LeadSummary=z.infer<typeof LeadSummarySchema>;
