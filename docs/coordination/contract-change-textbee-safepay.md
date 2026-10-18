# Contract Change Proposal: Textbee & Safepay Provider Integration

**Date**: 2026-10-18  
**Author**: Developer 2 (Gemini Integration Agent)  
**Status**: Proposed (Awaiting Developer 1 / GPT Supervisor review)  
**Related Documents**: `AGENTS.md`, `GEMINI.md`, `docs/features/integrations.md`, `src/contracts/integrations.ts`, `src/contracts/common.ts`

---

## 1. Proposed Interface Change

Due to geographic and payment clearing constraints in Pakistan, the external provider selections for customer messaging and payment processing are updated:
- Customer SMS Messaging: Replaced **Twilio** with **textbee** (Android SIM gateway, carrier SMS).
- Payments Gateway: Replaced **Stripe** with **Safepay Sandbox** (Pakistani payment gateway).
- Escalation Notifications: **Telegram Bot API** remains unchanged.

### Proposed Additions to `src/contracts/common.ts`

Update `ProviderSchema` to include `'textbee'` and `'safepay'`:

```typescript
export const ProviderSchema = z.enum([
  'twilio',
  'textbee',
  'stripe',
  'safepay',
  'google',
  'telegram'
]);
export type Provider = z.infer<typeof ProviderSchema>;
```

### Proposed Additions to `src/contracts/integrations.ts`

#### A. Textbee Credentials & Schemas

```typescript
export const TextbeeCredentialsSchema = z.strictObject({
  apiKey: z.string().min(1),
  deviceId: z.string().min(1),
  webhookSecret: z.string().min(1),
  gatewayNumber: PhoneE164Schema,
});
export type TextbeeCredentials = z.infer<typeof TextbeeCredentialsSchema>;

const textbeeIdentity = {
  provider: z.literal('textbee'),
  providerEventId: ReferenceSchema,
  providerMessageRef: ReferenceSchema,
  deviceId: z.string().min(1),
  channel: z.literal('sms'),
  from: PhoneE164Schema,
  to: PhoneE164Schema,
};

export const TextbeeMessageEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...textbeeIdentity,
    kind: z.literal('message.received'),
    body: z.string().max(10000),
    optOut: z.enum(['none', 'stop', 'start', 'help']),
  }),
  z.strictObject({
    ...textbeeIdentity,
    kind: z.literal('message.status'),
    state: z.enum(['pending', 'sent', 'delivered', 'failed']),
    errorCode: z.string().max(100).nullable(),
  }),
]);
export type TextbeeMessageEvent = z.infer<typeof TextbeeMessageEventSchema>;

export interface TextbeeMessagingAdapter {
  verifyInbound(input: RawWebhook, credentials: TextbeeCredentials): TextbeeMessageEvent;
  send(input: SendMessageCommand, credentials: TextbeeCredentials): Promise<ProviderOutcome<SentMessage>>;
}
```

*(Note: `VerifiedMessageEvent` can be generalized as `TwilioMessageEvent | TextbeeMessageEvent` or unified into a provider-neutral schema).*

#### B. Safepay Credentials & Schemas

```typescript
export const SafepayCredentialsSchema = z.strictObject({
  apiKey: z.string().min(1),
  v1Secret: z.string().min(1),
  webhookSecret: z.string().min(1),
  mode: z.literal('sandbox'),
});
export type SafepayCredentials = z.infer<typeof SafepayCredentialsSchema>;

const safepayIdentity = {
  provider: z.literal('safepay'),
  providerEventId: ReferenceSchema,
  occurredAt: InstantSchema,
  livemode: z.literal(false),
};

export const SafepayPaymentEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('checkout.completed'),
    providerSessionRef: ReferenceSchema, // tracker
    providerPaymentRef: ReferenceSchema.nullable(), // token/reference
    paymentStatus: z.enum(['paid', 'unpaid', 'no_payment_required']),
    money: MoneySchema,
    metadata: CheckoutMetadataSchema.nullable(),
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('checkout.expired'),
    providerSessionRef: ReferenceSchema,
    metadata: CheckoutMetadataSchema.nullable(),
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('payment.succeeded'),
    providerPaymentRef: ReferenceSchema, // tracker
    money: MoneySchema,
    metadata: CheckoutMetadataSchema.nullable(),
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('payment.failed'),
    providerPaymentRef: ReferenceSchema, // tracker
    errorCode: CodeSchema,
    metadata: CheckoutMetadataSchema.nullable(),
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('refund.confirmed'),
    providerPaymentRef: ReferenceSchema, // tracker
    providerRefundRef: ReferenceSchema, // eventToken or refund_token
    money: MoneySchema,
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('ignored'),
    providerEventType: z.string().min(1).max(100),
  }),
]);
export type SafepayPaymentEvent = z.infer<typeof SafepayPaymentEventSchema>;

export interface SafepayPaymentsAdapter {
  verifyWebhook(input: RawWebhook, credentials: SafepayCredentials): SafepayPaymentEvent;
  createCheckout(input: CheckoutCommand, credentials: SafepayCredentials): Promise<ProviderOutcome<CheckoutSession>>;
}
```

---

## 2. Affected Consumers and Owners

- **Developer 2 (Gemini)**:
  - Implements `src/modules/messaging/adapters/textbee.ts` and `tests/unit/providers/textbee.test.ts`.
  - Implements `src/modules/payments/adapters/safepay.ts` and `tests/unit/providers/safepay.test.ts`.
  - Implements `src/modules/notifications/adapters/telegram.ts` and `tests/unit/providers/telegram.test.ts`.
- **Developer 1 (GPT)**:
  - Updates `src/contracts/common.ts` and `src/contracts/integrations.ts` with approved shared schemas.
  - Ingress routes (`/api/webhooks/messaging`, `/api/webhooks/payments`).
  - Workspace credential management and encryption in Supabase Vault / private schema.
  - Payment collection accounting, lead creation, and messaging inbox orchestration.

---

## 3. Compatibility

- **Additive & Non-breaking**:
  - The proposed changes add new schemas and adapter interfaces alongside existing ones.
  - No database tables have been seeded with strict provider locks yet.
  - Twilio and Stripe adapters/types remain intact and can be deprecated cleanly without breaking current tests.

---

## 4. Migration and Rollback

- **Forward Migration**:
  1. Developer 1 merges contract additions to `feat/core-foundation` or shared contract baseline.
  2. Developer 2 integrates adapters conforming to these types.
  3. Ingress webhook endpoints route to `textbee` and `safepay` adapters.
- **Rollback**:
  - Since interfaces are strictly additive, rollback merely requires toggling workspace connection provider configuration back to Twilio/Stripe.

---

## 5. Required Reviewers

- Primary Technical Authority: Developer 1 (GPT Supervisor)
- Integration Contributor: Developer 2 (Gemini)
- Human Project Lead

---

## 6. Rollout and Verification

- Unit test suites verify HMAC-SHA256 (textbee) and HMAC-SHA512 (Safepay) verification, event normalization, and error classification without network dependencies.
- Sandbox verification occurs once external credentials and public HTTPS endpoints are configured.
