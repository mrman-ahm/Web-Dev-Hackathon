import { z } from 'zod';
import { AvailabilitySchema, IdSchema, InstantSchema, LeadSourceSchema, MoneySchema, OwnershipModeSchema, ProviderSchema, TimezoneSchema, VersionSchema } from './common';
const id=IdSchema, instant=InstantSchema, version=VersionSchema;
const safeCode=z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/);
const connectionStatus=z.enum(['disconnected','connected','error','reconnect_required']);
const tier=z.number().int().nonnegative();
const assigned={leadId:id,contactId:id,ownerMembershipId:id,assignmentVersion:version,tierLevel:tier,assignedAt:instant,ackDeadlineAt:instant};
export const eventPayloadSchemas={
 'identity.user_registered':z.strictObject({userId:id,workspaceId:id,membershipId:id}),
 'workspace.created':z.strictObject({ownerMembershipId:id}),
 'membership.changed':z.strictObject({membershipId:id,change:z.enum(['invited','joined','level_changed','deactivated','owner_transferred'])}),
 'permissions.changed':z.strictObject({roleId:id.nullable(),membershipId:id.nullable(),permissionKeys:z.array(z.string())}),
 'contact.created':z.strictObject({contactId:id}),
 'contact.updated':z.strictObject({contactId:id,changedFields:z.array(z.string())}),
 'contact.deleted':z.strictObject({contactId:id,mode:z.enum(['archived','deleted'])}),
 'crm.configuration_changed':z.strictObject({kind:z.enum(['pipeline','stage','field','filter','tag']),recordId:id,change:z.string().min(1)}),
 'opportunity.stage_changed':z.strictObject({opportunityId:id,contactId:id,fromStageId:id,toStageId:id,leadId:id.nullable()}),
 'lead.created':z.strictObject({leadId:id,contactId:id,source:LeadSourceSchema,ownershipMode:OwnershipModeSchema}),
 'lead.assigned':z.strictObject({...assigned,reason:z.enum(['initial','eligibility_recovered'])}),
 'lead.acknowledged':z.strictObject({leadId:id,assignmentVersion:version,ownerMembershipId:id,actionKind:z.enum(['explicit','note','call_log','stage_change','message_sent','appointment_created']),acknowledgedAt:instant,firstAcknowledgedAt:instant}),
 'lead.escalated':z.strictObject({leadId:id,contactId:id,fromMembershipId:id,toMembershipId:id,assignmentVersion:version,tierLevel:tier,source:LeadSourceSchema,reason:z.literal('deadline_expired'),assignedAt:instant,ackDeadlineAt:instant}).refine(v=>v.fromMembershipId!==v.toMembershipId,'An escalation must change the owner'),
 'lead.reassigned':z.strictObject({leadId:id,fromMembershipId:id,toMembershipId:id,assignmentVersion:version,ownershipMode:OwnershipModeSchema,reason:z.enum(['manual','absence','custody'])}).refine(v=>v.fromMembershipId!==v.toMembershipId,'A reassignment must change the owner'),
 'lead.recovered':z.strictObject({leadId:id,assignmentVersion:version,ownerMembershipId:id,recoveredAt:instant,lateAcknowledgement:z.literal(true)}),
 'lead.closed':z.strictObject({leadId:id,ownerMembershipId:id,reason:z.string().min(1)}),
 'employee.availability_changed':z.strictObject({membershipId:id,from:AvailabilitySchema,to:AvailabilitySchema}),
 'message.received':z.strictObject({messageId:id,conversationId:id,contactId:id,leadId:id.nullable()}),
 'message.sent':z.strictObject({messageId:id,conversationId:id,providerMessageRef:z.string().min(1),state:z.enum(['sent','delivered'])}),
 'message.failed':z.strictObject({messageId:id,conversationId:id,errorCode:safeCode,retryable:z.boolean()}),
 'payment.confirmed':z.strictObject({paymentRequestId:id,opportunityId:id,contactId:id,providerPaymentRef:z.string().min(1),money:MoneySchema,confirmedAt:instant}),
 'payment.refunded':z.strictObject({paymentRequestId:id,opportunityId:id,providerRefundRef:z.string().min(1),money:MoneySchema,confirmedAt:instant}),
 'appointment.created':z.strictObject({appointmentId:id,contactId:id,opportunityId:id.nullable(),employeeMembershipId:id,startsAt:instant,endsAt:instant,timezone:TimezoneSchema}),
 'appointment.rescheduled':z.strictObject({appointmentId:id,oldStartsAt:instant,oldEndsAt:instant,startsAt:instant,endsAt:instant,timezone:TimezoneSchema}),
 'appointment.cancelled':z.strictObject({appointmentId:id,cancelledAt:instant}),
 'integration.connection_changed':z.strictObject({connectionId:id,provider:ProviderSchema,fromStatus:connectionStatus,toStatus:connectionStatus}),
 'integration.event_failed':z.strictObject({connectionId:id,integrationEventId:id,errorCode:safeCode,retryable:z.boolean()}),
 'notification.delivery_changed':z.strictObject({deliveryId:id,leadId:id,recipientMembershipId:id,state:z.enum(['sent','failed','unknown']),errorCode:safeCode.nullable()}),
} as const;
export type EventName=keyof typeof eventPayloadSchemas;
export type EventPayload<N extends EventName>=z.infer<(typeof eventPayloadSchemas)[N]>;
const ActorSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('user'),membershipId:id}),
 z.strictObject({kind:z.literal('system'),membershipId:z.null()}),
 z.strictObject({kind:z.literal('provider'),membershipId:z.null()}),
]);
const envelope={id,name:z.string(),schemaVersion:z.literal(1),workspaceId:id,aggregate:z.strictObject({type:z.string().min(1),id,version}),occurredAt:instant,actor:ActorSchema,correlationId:id,causationId:id.nullable()};
export const DomainEventSchema=z.discriminatedUnion('name',[
 z.strictObject({...envelope,name:z.literal('identity.user_registered'),payload:eventPayloadSchemas['identity.user_registered']}),
 z.strictObject({...envelope,name:z.literal('workspace.created'),payload:eventPayloadSchemas['workspace.created']}),
 z.strictObject({...envelope,name:z.literal('membership.changed'),payload:eventPayloadSchemas['membership.changed']}),
 z.strictObject({...envelope,name:z.literal('permissions.changed'),payload:eventPayloadSchemas['permissions.changed']}),
 z.strictObject({...envelope,name:z.literal('contact.created'),payload:eventPayloadSchemas['contact.created']}),
 z.strictObject({...envelope,name:z.literal('contact.updated'),payload:eventPayloadSchemas['contact.updated']}),
 z.strictObject({...envelope,name:z.literal('contact.deleted'),payload:eventPayloadSchemas['contact.deleted']}),
 z.strictObject({...envelope,name:z.literal('crm.configuration_changed'),payload:eventPayloadSchemas['crm.configuration_changed']}),
 z.strictObject({...envelope,name:z.literal('opportunity.stage_changed'),payload:eventPayloadSchemas['opportunity.stage_changed']}),
 z.strictObject({...envelope,name:z.literal('lead.created'),payload:eventPayloadSchemas['lead.created']}),
 z.strictObject({...envelope,name:z.literal('lead.assigned'),payload:eventPayloadSchemas['lead.assigned']}),
 z.strictObject({...envelope,name:z.literal('lead.acknowledged'),payload:eventPayloadSchemas['lead.acknowledged']}),
 z.strictObject({...envelope,name:z.literal('lead.escalated'),payload:eventPayloadSchemas['lead.escalated']}),
 z.strictObject({...envelope,name:z.literal('lead.reassigned'),payload:eventPayloadSchemas['lead.reassigned']}),
 z.strictObject({...envelope,name:z.literal('lead.recovered'),payload:eventPayloadSchemas['lead.recovered']}),
 z.strictObject({...envelope,name:z.literal('lead.closed'),payload:eventPayloadSchemas['lead.closed']}),
 z.strictObject({...envelope,name:z.literal('employee.availability_changed'),payload:eventPayloadSchemas['employee.availability_changed']}),
 z.strictObject({...envelope,name:z.literal('message.received'),payload:eventPayloadSchemas['message.received']}),
 z.strictObject({...envelope,name:z.literal('message.sent'),payload:eventPayloadSchemas['message.sent']}),
 z.strictObject({...envelope,name:z.literal('message.failed'),payload:eventPayloadSchemas['message.failed']}),
 z.strictObject({...envelope,name:z.literal('payment.confirmed'),payload:eventPayloadSchemas['payment.confirmed']}),
 z.strictObject({...envelope,name:z.literal('payment.refunded'),payload:eventPayloadSchemas['payment.refunded']}),
 z.strictObject({...envelope,name:z.literal('appointment.created'),payload:eventPayloadSchemas['appointment.created']}),
 z.strictObject({...envelope,name:z.literal('appointment.rescheduled'),payload:eventPayloadSchemas['appointment.rescheduled']}),
 z.strictObject({...envelope,name:z.literal('appointment.cancelled'),payload:eventPayloadSchemas['appointment.cancelled']}),
 z.strictObject({...envelope,name:z.literal('integration.connection_changed'),payload:eventPayloadSchemas['integration.connection_changed']}),
 z.strictObject({...envelope,name:z.literal('integration.event_failed'),payload:eventPayloadSchemas['integration.event_failed']}),
 z.strictObject({...envelope,name:z.literal('notification.delivery_changed'),payload:eventPayloadSchemas['notification.delivery_changed']})
]).superRefine((event,context)=>{
 if ('workspaceId' in event.payload && event.payload.workspaceId!==event.workspaceId) context.addIssue({code:'custom',path:['payload','workspaceId'],message:'Workspace identity mismatch'});
});
export type DomainEvent<N extends EventName=EventName>=Extract<z.infer<typeof DomainEventSchema>,{name:N}>;
export const RealtimeSignalSchema=z.strictObject({kind:z.literal('invalidate'),domain:z.string().min(1),revision:z.string().min(1)});
export type RealtimeSignal=z.infer<typeof RealtimeSignalSchema>;
