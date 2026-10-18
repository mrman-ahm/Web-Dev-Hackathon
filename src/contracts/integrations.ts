/** Pure schemas and types only. Adapters/orchestration import types from this module;
 * runtime implementations belong in server-only modules. No SDK type crosses a port.
 * Credentials are injected transiently, never included in events/outcomes/log DTOs. */
import { z } from 'zod';
import { CurrencySchema, HttpsUrlSchema, IdSchema, InstantSchema, MoneySchema, NonemptySchema, PhoneE164Schema, TimezoneSchema } from './common';
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

/** Provider-neutral v1 ports used by the Textbee, Safepay Sandbox and Telegram
 * adapters. Legacy Twilio/Stripe schemas above remain available during migration. */
const ProviderReferenceV1Schema = z.string().trim().min(1).max(500);
const PositiveMoneyV1Schema = MoneySchema.refine(value => value.amountMinor !== '0', 'Amount must be positive');
export const MessagingProviderV1Schema = z.enum(['twilio', 'textbee']);
export const PaymentProviderV1Schema = z.enum(['stripe', 'safepay']);
export const NotificationProviderV1Schema = z.enum(['telegram']);
export type MessagingProviderV1 = z.infer<typeof MessagingProviderV1Schema>;
export type PaymentProviderV1 = z.infer<typeof PaymentProviderV1Schema>;
export type NotificationProviderV1 = z.infer<typeof NotificationProviderV1Schema>;

// Messaging v1 ---------------------------------------------------------------
export const SmsSendCommandV1Schema = z.strictObject({
 deliveryId: IdSchema,
 to: PhoneE164Schema,
 body: z.string().min(1).max(1600),
});
export type SmsSendCommandV1 = z.infer<typeof SmsSendCommandV1Schema>;

/** Queue acceptance is not a delivery confirmation. Textbee returns one batch
 * identity even when the batch contains multiple recipient messages. */
export const SmsSubmissionV1Schema = z.strictObject({
 providerBatchRef: ProviderReferenceV1Schema,
 acceptedRecipientCount: z.number().int().positive(),
 state: z.literal('queued'),
});
export type SmsSubmissionV1 = z.infer<typeof SmsSubmissionV1Schema>;

/** Textbee POST /gateway/send-sms JSON request and response payloads. */
export const TextbeeSendSmsPayloadV1Schema = z.strictObject({
 message: z.string().min(1).max(10000),
 recipients: z.array(PhoneE164Schema).min(1).max(1000),
 deviceId: ProviderReferenceV1Schema.optional(),
});
export const TextbeeSendSmsResponseV1Schema = z.strictObject({
 data: z.strictObject({
  success: z.literal(true),
  message: z.string().min(1).max(500),
  smsBatchId: ProviderReferenceV1Schema,
  recipientCount: z.number().int().positive(),
 }),
});

const TextbeeWebhookEnvelopeV1Schema = z.strictObject({
 smsId: ProviderReferenceV1Schema,
 message: z.string().max(10000),
 deviceId: ProviderReferenceV1Schema,
 webhookSubscriptionId: ProviderReferenceV1Schema,
 idempotencyKey: ProviderReferenceV1Schema,
 simUsed: z.strictObject({
  subscriptionId: z.number().int().nonnegative().optional(),
  slotIndex: z.number().int().nonnegative().optional(),
 }).optional(),
});

/** Verified provider payload shapes, kept separate from normalized application
 * events. `idempotencyKey` is stable across retries of the same webhook delivery. */
export const TextbeeWebhookPayloadV1Schema = z.discriminatedUnion('webhookEvent', [
 z.strictObject({
  ...TextbeeWebhookEnvelopeV1Schema.shape,
  webhookEvent: z.literal('MESSAGE_RECEIVED'),
  sender: z.string().min(1).max(500).refine(value => value.trim().length > 0),
  receivedAt: InstantSchema,
 }),
 z.strictObject({
  ...TextbeeWebhookEnvelopeV1Schema.shape,
  webhookEvent: z.literal('MESSAGE_SENT'),
  smsBatchId: ProviderReferenceV1Schema,
  status: z.literal('sent'),
  recipient: PhoneE164Schema,
  sentAt: InstantSchema,
 }),
 z.strictObject({
  ...TextbeeWebhookEnvelopeV1Schema.shape,
  webhookEvent: z.literal('MESSAGE_DELIVERED'),
  smsBatchId: ProviderReferenceV1Schema,
  status: z.literal('delivered'),
  recipient: PhoneE164Schema,
  sentAt: InstantSchema,
  deliveredAt: InstantSchema,
 }),
 z.strictObject({
  ...TextbeeWebhookEnvelopeV1Schema.shape,
  webhookEvent: z.literal('MESSAGE_FAILED'),
  smsBatchId: ProviderReferenceV1Schema,
  status: z.literal('failed'),
  recipient: PhoneE164Schema,
  errorCode: z.string().max(100),
  errorMessage: z.string().max(1000).optional(),
  failedAt: InstantSchema,
 }),
 z.strictObject({
  ...TextbeeWebhookEnvelopeV1Schema.shape,
  webhookEvent: z.literal('UNKNOWN_STATE'),
  smsBatchId: ProviderReferenceV1Schema,
  status: z.string().trim().min(1).max(100),
  recipient: PhoneE164Schema,
 }),
]);
export type TextbeeWebhookPayloadV1 = z.infer<typeof TextbeeWebhookPayloadV1Schema>;

const SmsEventIdentityV1Schema = z.strictObject({
 provider: MessagingProviderV1Schema,
 providerEventId: ProviderReferenceV1Schema,
 providerMessageRef: ProviderReferenceV1Schema,
 /** This is the SMS batch reference, never the per-message reference. */
 providerBatchRef: ProviderReferenceV1Schema.nullable(),
 occurredAt: InstantSchema.nullable(),
});

/** Core-facing event. Sender text is retained verbatim as a provider address;
 * contact matching is a separate workspace operation and is not implied here. */
export const SmsWebhookEventV1Schema = z.discriminatedUnion('kind', [
 z.strictObject({
  ...SmsEventIdentityV1Schema.shape,
  kind: z.literal('message.received'),
  body: z.string().max(10000),
  senderAddress: z.string().min(1).max(500).refine(value => value.trim().length > 0),
 }),
 z.strictObject({
  ...SmsEventIdentityV1Schema.shape,
  kind: z.literal('message.sent'),
  recipient: PhoneE164Schema,
 }),
 z.strictObject({
  ...SmsEventIdentityV1Schema.shape,
  kind: z.literal('message.delivered'),
  recipient: PhoneE164Schema,
 }),
 z.strictObject({
  ...SmsEventIdentityV1Schema.shape,
  kind: z.literal('message.failed'),
  recipient: PhoneE164Schema,
  errorCode: z.string().max(100),
 }),
 z.strictObject({
  ...SmsEventIdentityV1Schema.shape,
  kind: z.literal('message.unknown'),
  recipient: PhoneE164Schema,
  providerState: z.string().trim().min(1).max(100),
 }),
]);
export type SmsWebhookEventV1 = z.infer<typeof SmsWebhookEventV1Schema>;

/** Credentials are supplied transiently by core and must never enter event DTOs. */
export interface SmsAdapterV1<Credentials> {
 send(input: SmsSendCommandV1, credentials: Credentials): Promise<ProviderOutcome<SmsSubmissionV1>>;
 verifyWebhook(input: RawWebhook, credentials: Credentials): SmsWebhookEventV1;
}

// Payments v1 ----------------------------------------------------------------
export const SafepayCredentialsV1Schema = z.strictObject({
 merchantApiKey: z.string().min(1),
 merchantSecret: z.string().min(1),
 environment: z.literal('sandbox'),
});
export type SafepayCredentialsV1 = z.infer<typeof SafepayCredentialsV1Schema>;

/** Safepay sandbox POST /order/payments/v3 tracker-create wire payload. Provider
 * integer minor units are required and must be positive; no currency defaults. */
export const SafepayCreateTrackerPayloadV1Schema = z.strictObject({
 merchant_api_key: z.string().min(1),
 intent: z.literal('CYBERSOURCE'),
 mode: z.literal('payment'),
 currency: CurrencySchema,
 amount: z.number().int().positive().safe(),
 entry_mode: z.enum(['flex', 'raw', 'tms']).optional(),
 metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export const SafepayCreateTrackerResponseV1Schema = z.strictObject({
 data: z.strictObject({
  tracker: z.strictObject({
   token: ProviderReferenceV1Schema,
   environment: z.literal('sandbox'),
   state: z.string().min(1).max(100),
   metadata: z.unknown().optional(),
  }),
 }),
});

/** Safepay accepts metadata maps, but metadata echoed by the provider is
 * untrusted and nullable. It is never a source of workspace/actor identity. */
export const UntrustedProviderMetadataV1Schema = z.record(z.string(), z.unknown()).nullable();
export const SafepayCheckoutCommandV1Schema = z.strictObject({
 paymentRequestId: IdSchema,
 idempotencyKey: IdSchema,
 money: PositiveMoneyV1Schema,
 description: NonemptySchema,
 customerEmail: z.email().nullable(),
 metadata: UntrustedProviderMetadataV1Schema,
});
export type SafepayCheckoutCommandV1 = z.infer<typeof SafepayCheckoutCommandV1Schema>;

export const SafepayCheckoutSessionV1Schema = z.strictObject({
 /** Safepay track_* token; it is not a captured-payment reference. */
 providerTrackerRef: ProviderReferenceV1Schema,
 checkoutUrl: HttpsUrlSchema.nullable(),
 /** Safepay supplies no universal tracker expiry; keep it absent as null. */
 expiresAt: InstantSchema.nullable(),
});
export type SafepayCheckoutSessionV1 = z.infer<typeof SafepayCheckoutSessionV1Schema>;

const SafepayEventBaseV1Schema = z.strictObject({
 provider: PaymentProviderV1Schema,
 providerEventId: ProviderReferenceV1Schema,
 /** Some Safepay facts do not include an event timestamp; do not synthesize one. */
 occurredAt: InstantSchema.nullable(),
 providerTrackerRef: ProviderReferenceV1Schema.nullable(),
 metadata: UntrustedProviderMetadataV1Schema,
});

export const SafepayPaymentEventV1Schema = z.discriminatedUnion('kind', [
 z.strictObject({
  ...SafepayEventBaseV1Schema.shape,
  kind: z.literal('payment.confirmed'),
  providerPaymentRef: ProviderReferenceV1Schema,
  money: PositiveMoneyV1Schema,
 }),
 z.strictObject({
  ...SafepayEventBaseV1Schema.shape,
  kind: z.literal('payment.failed'),
  providerPaymentRef: ProviderReferenceV1Schema.nullable(),
  errorCode: CodeSchema,
 }),
 z.strictObject({
  ...SafepayEventBaseV1Schema.shape,
  kind: z.literal('payment.unknown'),
  providerPaymentRef: ProviderReferenceV1Schema.nullable(),
 }),
 z.strictObject({
  ...SafepayEventBaseV1Schema.shape,
  kind: z.literal('refund.confirmed'),
  providerPaymentRef: ProviderReferenceV1Schema,
  /** Provider refund IDs are not present in every Safepay refund response. */
  providerRefundRef: ProviderReferenceV1Schema.nullable(),
  money: PositiveMoneyV1Schema,
 }),
]);
export type SafepayPaymentEventV1 = z.infer<typeof SafepayPaymentEventV1Schema>;

export interface PaymentsAdapterV1<Credentials> {
 createCheckout(input: SafepayCheckoutCommandV1, credentials: Credentials): Promise<ProviderOutcome<SafepayCheckoutSessionV1>>;
 verifyWebhook(input: RawWebhook, credentials: Credentials): SafepayPaymentEventV1;
}

// Notifications v1 -----------------------------------------------------------
const TelegramDestinationV1Schema = z.union([
 z.string().regex(/^-?[1-9]\d{0,17}$/),
 z.string().regex(/^@[A-Za-z0-9_]{5,32}$/),
]);
export const TelegramCredentialsV1Schema = z.strictObject({ botToken: z.string().min(1) });
export type TelegramCredentialsV1 = z.infer<typeof TelegramCredentialsV1Schema>;

/** Telegram Bot API sendMessage response fields used by the v1 adapter. A
 * Telegram message id is scoped to its chat, and `date` is Unix seconds. */
export const TelegramSendMessageResponseV1Schema = z.object({
 ok: z.literal(true),
 result: z.object({
  message_id: z.number().int().positive().safe(),
  date: z.number().int().nonnegative().safe(),
  chat: z.object({ id: z.number().int().safe() }).passthrough(),
 }).passthrough(),
}).passthrough();

export const NotificationCommandV1Schema = z.strictObject({
 deliveryId: IdSchema,
 destination: TelegramDestinationV1Schema,
 text: z.string().min(1).max(4096),
});
export type NotificationCommandV1 = z.infer<typeof NotificationCommandV1Schema>;

/** Telegram's `Message.date` is normalized to an instant; the message ID remains
 * a string so callers do not conflate it with application IDs. */
export const NotificationReceiptV1Schema = z.strictObject({
 provider: NotificationProviderV1Schema,
 providerMessageRef: ProviderReferenceV1Schema,
 providerChatRef: ProviderReferenceV1Schema,
 occurredAt: InstantSchema,
});
export type NotificationReceiptV1 = z.infer<typeof NotificationReceiptV1Schema>;

export interface NotificationAdapterV1<Credentials> {
 send(input: NotificationCommandV1, credentials: Credentials): Promise<ProviderOutcome<NotificationReceiptV1>>;
}
