/** Pure schemas and types only. Adapters/orchestration import types from this module;
 * runtime implementations belong in server-only modules. No SDK type crosses a port.
 * Credentials are injected transiently, never included in events/outcomes/log DTOs. */
import { z } from 'zod';
import { HttpsUrlSchema, IdSchema, InstantSchema, MoneySchema, NonemptySchema, PhoneE164Schema, TimezoneSchema } from './common';
const CodeSchema=z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/);
const ReferenceSchema=z.string().min(1).max(500);
export const ProviderOutcomeSchema=<T extends z.ZodType>(value:T)=>z.discriminatedUnion('status',[
 z.strictObject({status:z.literal('confirmed'),value,reference:ReferenceSchema}),
 z.strictObject({status:z.literal('temporary_failure'),code:CodeSchema,retryAfterSeconds:z.number().int().nonnegative().max(86400).optional()}),
 z.strictObject({status:z.literal('permanent_failure'),code:CodeSchema}),
 z.strictObject({status:z.literal('unknown'),code:CodeSchema,reconciliationReference:ReferenceSchema.optional()}),
]);
export type ProviderOutcome<T>={status:'confirmed';value:T;reference:string}
 |{status:'temporary_failure';code:string;retryAfterSeconds?:number}
 |{status:'permanent_failure';code:string}
 |{status:'unknown';code:string;reconciliationReference?:string};
export const VerificationErrorCodeSchema=z.enum(['INVALID_SIGNATURE','INVALID_PAYLOAD','CONNECTION_MISMATCH','UNSUPPORTED_CONTENT_TYPE','STALE_SIGNATURE']);
export type VerificationErrorCode=z.infer<typeof VerificationErrorCodeSchema>;
/** Verification methods throw only this safe error for untrusted requests. Never
 * attach the raw body, SDK error, signature, URL/token or credentials as a cause. */
export class AdapterVerificationError extends Error {
 readonly name='AdapterVerificationError';
 constructor(readonly code:VerificationErrorCode) { super(code); }
}
export const RawWebhookSchema=z.strictObject({rawBody:z.instanceof(Uint8Array),headers:z.instanceof(Headers),canonicalUrl:HttpsUrlSchema});
export type RawWebhook=z.infer<typeof RawWebhookSchema>;
export const TwilioCredentialsSchema=z.strictObject({accountSid:z.string().regex(/^AC[0-9a-fA-F]{32}$/),authToken:z.string().min(1),channel:z.enum(['sms','whatsapp']),from:PhoneE164Schema});
export const StripeCredentialsSchema=z.strictObject({secretKey:z.string().min(1),webhookSigningSecret:z.string().min(1),mode:z.literal('test')});
export const TelegramCredentialsSchema=z.strictObject({botToken:z.string().min(1)});
export type TwilioCredentials=z.infer<typeof TwilioCredentialsSchema>;
export type StripeCredentials=z.infer<typeof StripeCredentialsSchema>;
export type TelegramCredentials=z.infer<typeof TelegramCredentialsSchema>;
export const SendMessageCommandSchema=z.strictObject({deliveryId:IdSchema,channel:z.enum(['sms','whatsapp']),from:PhoneE164Schema,to:PhoneE164Schema,body:z.string().min(1).max(1600),statusCallbackUrl:HttpsUrlSchema});
export const SentMessageSchema=z.strictObject({providerMessageRef:ReferenceSchema,state:z.enum(['pending','sent']),channel:z.enum(['sms','whatsapp'])});
const twilioIdentity={provider:z.literal('twilio'),providerEventId:ReferenceSchema,providerMessageRef:ReferenceSchema,accountSid:z.string().min(1),channel:z.enum(['sms','whatsapp']),from:PhoneE164Schema,to:PhoneE164Schema};
/** providerEventId is deterministic: message SID for inbound; SID + normalized state
 * + safe error code for callbacks. It is an inbox dedupe key, not trusted business IDs. */
export const VerifiedMessageEventSchema=z.discriminatedUnion('kind',[
 z.strictObject({...twilioIdentity,kind:z.literal('message.received'),body:z.string().max(10000),optOut:z.enum(['none','stop','start','help'])}),
 z.strictObject({...twilioIdentity,kind:z.literal('message.status'),state:z.enum(['pending','sent','delivered','failed']),errorCode:z.string().max(100).nullable()}),
]);
export type SendMessageCommand=z.infer<typeof SendMessageCommandSchema>;
export type SentMessage=z.infer<typeof SentMessageSchema>;
export type VerifiedMessageEvent=z.infer<typeof VerifiedMessageEventSchema>;
export interface MessagingAdapter {
 verifyInbound(input:RawWebhook,credentials:TwilioCredentials):VerifiedMessageEvent;
 send(input:SendMessageCommand,credentials:TwilioCredentials):Promise<ProviderOutcome<SentMessage>>;
}
/** Only opaque internal identifiers are sent as metadata. They are untrusted on
 * webhook return and must be revalidated by core against the trusted connection. */
export const CheckoutMetadataSchema=z.strictObject({paymentRequestId:IdSchema,contactId:IdSchema,opportunityId:IdSchema});
export const CheckoutCommandSchema=z.strictObject({paymentRequestId:IdSchema,idempotencyKey:IdSchema,money:MoneySchema,description:NonemptySchema,customerEmail:z.email().nullable(),metadata:CheckoutMetadataSchema,successUrl:HttpsUrlSchema,cancelUrl:HttpsUrlSchema}).refine(v=>v.metadata.paymentRequestId===v.paymentRequestId,'Payment request metadata mismatch');
export const CheckoutSessionSchema=z.strictObject({providerSessionRef:ReferenceSchema,checkoutUrl:HttpsUrlSchema,expiresAt:InstantSchema});
const stripeIdentity={provider:z.literal('stripe'),providerEventId:ReferenceSchema,occurredAt:InstantSchema,livemode:z.literal(false)};
export const VerifiedPaymentEventSchema=z.discriminatedUnion('kind',[
 z.strictObject({...stripeIdentity,kind:z.literal('checkout.completed'),providerSessionRef:ReferenceSchema,providerPaymentRef:ReferenceSchema.nullable(),paymentStatus:z.enum(['paid','unpaid','no_payment_required']),money:MoneySchema,metadata:CheckoutMetadataSchema}),
 z.strictObject({...stripeIdentity,kind:z.literal('checkout.expired'),providerSessionRef:ReferenceSchema,metadata:CheckoutMetadataSchema}),
 z.strictObject({...stripeIdentity,kind:z.literal('payment.succeeded'),providerPaymentRef:ReferenceSchema,money:MoneySchema,metadata:CheckoutMetadataSchema}),
 z.strictObject({...stripeIdentity,kind:z.literal('payment.failed'),providerPaymentRef:ReferenceSchema,errorCode:CodeSchema,metadata:CheckoutMetadataSchema}),
 z.strictObject({...stripeIdentity,kind:z.literal('refund.confirmed'),providerPaymentRef:ReferenceSchema,providerRefundRef:ReferenceSchema,money:MoneySchema}),
 z.strictObject({...stripeIdentity,kind:z.literal('ignored'),providerEventType:z.string().min(1).max(100)}),
]);
export type CheckoutMetadata=z.infer<typeof CheckoutMetadataSchema>;
export type CheckoutCommand=z.infer<typeof CheckoutCommandSchema>;
export type CheckoutSession=z.infer<typeof CheckoutSessionSchema>;
export type VerifiedPaymentEvent=z.infer<typeof VerifiedPaymentEventSchema>;
export interface PaymentsAdapter {
 verifyWebhook(input:RawWebhook,credentials:StripeCredentials):VerifiedPaymentEvent;
 createCheckout(input:CheckoutCommand,credentials:StripeCredentials):Promise<ProviderOutcome<CheckoutSession>>;
}
export const NotificationCommandSchema=z.strictObject({chatId:z.string().regex(/^-?[1-9]\d*$/),text:z.string().min(1).max(4096),deliveryId:IdSchema});
export const NotificationSentSchema=z.strictObject({messageId:ReferenceSchema});
export type NotificationCommand=z.infer<typeof NotificationCommandSchema>;
export type NotificationSent=z.infer<typeof NotificationSentSchema>;
export interface NotificationAdapter {
 send(input:NotificationCommand,token:string):Promise<ProviderOutcome<NotificationSent>>;
}
/** Google belongs to Developer 1. Access tokens are injected by core; refreshing,
 * encrypted persistence, OAuth state and job retries are orchestration concerns. */
export const GoogleCredentialsSchema=z.strictObject({accessToken:z.string().min(1),calendarId:z.string().min(1)});
export const BusyQuerySchema=z.strictObject({startsAt:InstantSchema,endsAt:InstantSchema,timezone:TimezoneSchema}).refine(v=>v.endsAt>v.startsAt,'End must follow start');
export const BusyIntervalsSchema=z.strictObject({intervals:z.array(z.strictObject({startsAt:InstantSchema,endsAt:InstantSchema}).refine(v=>v.endsAt>v.startsAt)),checkedAt:InstantSchema});
export const CalendarEventCommandSchema=z.strictObject({appointmentId:IdSchema,providerEventId:z.string().regex(/^[0-9a-v]{5,1024}$/),summary:NonemptySchema,startsAt:InstantSchema,endsAt:InstantSchema,timezone:TimezoneSchema,expectedEtag:z.string().nullable()}).refine(v=>v.endsAt>v.startsAt,'End must follow start');
export const CalendarEventSchema=z.strictObject({providerEventId:ReferenceSchema,etag:ReferenceSchema,startsAt:InstantSchema,endsAt:InstantSchema,timezone:TimezoneSchema});
export const CancelEventCommandSchema=z.strictObject({providerEventId:ReferenceSchema,expectedEtag:z.string().nullable()});
export const CancelledEventSchema=z.strictObject({providerEventId:ReferenceSchema,cancelledAt:InstantSchema});
export type GoogleCredentials=z.infer<typeof GoogleCredentialsSchema>;
export type BusyQuery=z.infer<typeof BusyQuerySchema>;
export type BusyIntervals=z.infer<typeof BusyIntervalsSchema>;
export type CalendarEventCommand=z.infer<typeof CalendarEventCommandSchema>;
export type CalendarEvent=z.infer<typeof CalendarEventSchema>;
export type CancelEventCommand=z.infer<typeof CancelEventCommandSchema>;
export type CancelledEvent=z.infer<typeof CancelledEventSchema>;
export interface CalendarAdapter {
 busy(input:BusyQuery,credentials:GoogleCredentials):Promise<ProviderOutcome<BusyIntervals>>;
 upsert(input:CalendarEventCommand,credentials:GoogleCredentials):Promise<ProviderOutcome<CalendarEvent>>;
 cancel(input:CancelEventCommand,credentials:GoogleCredentials):Promise<ProviderOutcome<CancelledEvent>>;
}
