import { describe, expect, it } from 'vitest';
import {
  NotificationCommandV1Schema,
  NotificationReceiptV1Schema,
  SafepayCredentialsV1Schema,
  SafepayCheckoutCommandV1Schema,
  SafepayCheckoutSessionV1Schema,
  SafepayCreateTrackerPayloadV1Schema,
  SafepayCreateTrackerResponseV1Schema,
  SafepayPaymentEventV1Schema,
  SafepayWebhookPayloadV1Schema,
  MessagingProviderV1Schema,
  PaymentProviderV1Schema,
  NotificationProviderV1Schema,
  SmsSendCommandV1Schema,
  SmsWebhookEventV1Schema,
  TelegramSendMessageResponseV1Schema,
  TextbeeWebhookPayloadV1Schema,
} from '../../src/contracts/integrations';
import { ProviderSchema } from '../../src/contracts/common';
import { IntegrationDtoSchema, PaymentDtoSchema } from '../../src/contracts/api';
import { DomainEventSchema } from '../../src/contracts/events';

describe('provider v1 support declarations', () => {
  it('accepts only the approved v1 providers for each port', () => {
    expect(MessagingProviderV1Schema.parse('textbee')).toBe('textbee');
    expect(MessagingProviderV1Schema.safeParse('twilio').success).toBe(false);
    expect(PaymentProviderV1Schema.parse('safepay')).toBe('safepay');
    expect(PaymentProviderV1Schema.safeParse('stripe').success).toBe(false);
    expect(NotificationProviderV1Schema.parse('telegram')).toBe('telegram');
  });

  it('exposes only active providers through current connection DTO and event contracts', () => {
    const integration = {
      id: '11111111-1111-4111-8111-111111111111',
      version: 1,
      membershipId: null,
      status: 'connected',
      lastSuccessAt: null,
      lastError: null,
      limits: [],
    };
    const connectionEvent = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'integration.connection_changed',
      schemaVersion: 1,
      workspaceId: '22222222-2222-4222-8222-222222222222',
      aggregate: { type: 'integration', id: '33333333-3333-4333-8333-333333333333', version: 1 },
      occurredAt: '2026-10-18T08:00:00Z',
      actor: { kind: 'provider', membershipId: null },
      correlationId: '44444444-4444-4444-8444-444444444444',
      causationId: null,
      payload: {
        connectionId: '55555555-5555-4555-8555-555555555555',
        provider: 'textbee',
        fromStatus: 'disconnected',
        toStatus: 'connected',
      },
    };

    for (const provider of ['textbee', 'safepay', 'telegram', 'google']) {
      expect(ProviderSchema.parse(provider)).toBe(provider);
      expect(IntegrationDtoSchema.safeParse({ ...integration, provider }).success).toBe(true);
      expect(DomainEventSchema.safeParse({ ...connectionEvent, payload: { ...connectionEvent.payload, provider } }).success).toBe(true);
    }
    for (const provider of ['twilio', 'stripe']) {
      expect(ProviderSchema.safeParse(provider).success).toBe(false);
      expect(IntegrationDtoSchema.safeParse({ ...integration, provider }).success).toBe(false);
      expect(DomainEventSchema.safeParse({ ...connectionEvent, payload: { ...connectionEvent.payload, provider } }).success).toBe(false);
    }
  });
});

describe('Textbee-compatible SMS v1 contracts', () => {
  it('keeps unknown delivery reports unresolved and preserves message and batch refs', () => {
    const event = {
      provider: 'textbee',
      kind: 'message.unknown',
      providerEventId: '4a6c8e0b-2d4f-4a1c-9e3b-5d7f9a1c3e5b',
      providerMessageRef: '66f7c3a9b1c2d3e4f5a6b7c9',
      providerBatchRef: '66f7c3a8b1c2d3e4f5a6b7c0',
      providerState: 'delivery_failed',
      recipient: '+12015550126',
      occurredAt: null,
    };

    expect(SmsWebhookEventV1Schema.parse(event)).toEqual(event);
    expect(event.providerMessageRef).toBe('66f7c3a9b1c2d3e4f5a6b7c9');
    expect(event.providerBatchRef).toBe('66f7c3a8b1c2d3e4f5a6b7c0');
    expect(event.providerState).toBe('delivery_failed');
    expect(SmsWebhookEventV1Schema.safeParse({ ...event, providerBatchRef: undefined }).success).toBe(false);
    expect(SmsWebhookEventV1Schema.safeParse({ ...event, state: 'failed' }).success).toBe(false);
  });

  it('retains non-E.164 sender forms as unassociated provider text', () => {
    const officialPayload = {
      smsId: '66f7c1e2a4d5e6f7a8b9c0d1',
      message: 'YES, please confirm my booking',
      deviceId: '664a9b8cd0e1f2a3b4c5d6e7',
      webhookSubscriptionId: '664a9b8cd0e1f2a3b4c5d6e8',
      webhookEvent: 'MESSAGE_RECEIVED',
      idempotencyKey: '8f7e6d5c-4b3a-4c1d-8e9f-8a7b6c5d4e3f',
      sender: 'ACME',
      receivedAt: '2026-09-28T09:14:03.000Z',
    };
    expect(TextbeeWebhookPayloadV1Schema.parse(officialPayload)).toEqual(officialPayload);

    const event = {
      provider: 'textbee',
      kind: 'message.received',
      providerEventId: '8f7e6d5c-4b3a-4c1d-8e9f-8a7b6c5d4e3f',
      providerMessageRef: '66f7c1e2a4d5e6f7a8b9c0d1',
      providerBatchRef: null,
      body: 'Your code is ready',
      senderAddress: 'ACME',
      occurredAt: '2026-09-28T09:14:03.000Z',
    };

    expect(SmsWebhookEventV1Schema.parse(event)).toEqual(event);
    expect(event.occurredAt).toBe(officialPayload.receivedAt);
    expect(event.providerMessageRef).toBe(officialPayload.smsId);
    expect(SmsWebhookEventV1Schema.safeParse({ ...event, contactId: '11111111-1111-4111-8111-111111111111' }).success).toBe(false);
  });

  it('requires provider-stable event identity and preserves supplied event time', () => {
    const unknownPayload = {
      smsId: '66f7c3a9b1c2d3e4f5a6b7c9',
      message: 'Your order has shipped.',
      deviceId: '664a9b8cd0e1f2a3b4c5d6e7',
      webhookSubscriptionId: '664a9b8cd0e1f2a3b4c5d6e8',
      webhookEvent: 'UNKNOWN_STATE',
      idempotencyKey: '4a6c8e0b-2d4f-4a1c-9e3b-5d7f9a1c3e5b',
      smsBatchId: '66f7c3a8b1c2d3e4f5a6b7c0',
      status: 'delivery_failed',
      recipient: '+12015550126',
    };
    expect(TextbeeWebhookPayloadV1Schema.parse(unknownPayload)).toEqual(unknownPayload);
    expect(TextbeeWebhookPayloadV1Schema.safeParse({ ...unknownPayload, idempotencyKey: '' }).success).toBe(false);

    const event = {
      provider: 'textbee',
      kind: 'message.delivered',
      providerEventId: '5c7e9a1b-3d5f-4b6c-8e0a-2d4f6a8c0e3b',
      providerMessageRef: '66f7c3a9b1c2d3e4f5a6b7c8',
      providerBatchRef: '66f7c3a8b1c2d3e4f5a6b7c0',
      recipient: '+12015550124',
      occurredAt: '2026-09-28T10:02:21.000Z',
    };

    expect(SmsWebhookEventV1Schema.parse(event).occurredAt).toBe(event.occurredAt);
    expect(SmsWebhookEventV1Schema.safeParse({ ...event, providerEventId: '' }).success).toBe(false);
    expect(SmsSendCommandV1Schema.safeParse({ deliveryId: '11111111-1111-4111-8111-111111111111', to: '123', body: 'hello' }).success).toBe(false);
  });
});

describe('Safepay-compatible payment v1 contracts', () => {
  it('distinguishes application policy expiry from provider-confirmed expiry in payment DTOs', () => {
    const payment = {
      id: '11111111-1111-4111-8111-111111111111',
      version: 2,
      opportunityId: '22222222-2222-4222-8222-222222222222',
      contactId: '33333333-3333-4333-8333-333333333333',
      requestedBy: '44444444-4444-4444-8444-444444444444',
      money: { amountMinor: '5000', currency: 'PKR' },
      state: 'policy_expired',
      checkoutUrl: null,
      providerTrackerRef: 'track_895ca125-8bd3-438e-82ea-ce93e5845933',
      providerPaymentRef: null,
      providerExpiresAt: null,
      applicationPolicyExpiresAt: '2026-10-04T10:12:44.000Z',
    };

    expect(PaymentDtoSchema.parse(payment)).toEqual(payment);
    expect(PaymentDtoSchema.safeParse({ ...payment, state: 'expired' }).success).toBe(true);
    expect(PaymentDtoSchema.safeParse({ ...payment, applicationPolicyExpiresAt: undefined }).success).toBe(false);
  });

  it('requires explicit positive money and currency at checkout creation', () => {
    const officialPayload = {
      merchant_api_key: 'sec_sandbox_example',
      intent: 'CYBERSOURCE',
      mode: 'payment',
      currency: 'PKR',
      amount: 5000,
      entry_mode: 'raw',
      metadata: { source: 'shopify', order_id: '41231X' },
    };
    expect(SafepayCreateTrackerPayloadV1Schema.parse(officialPayload)).toEqual(officialPayload);
    expect(SafepayCreateTrackerPayloadV1Schema.safeParse({ ...officialPayload, amount: 0 }).success).toBe(false);
    expect(SafepayCreateTrackerPayloadV1Schema.safeParse({ ...officialPayload, currency: undefined }).success).toBe(false);

    const command = {
      paymentRequestId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      money: { amountMinor: '5000', currency: 'PKR' },
      description: 'Invoice 41231X',
      customerEmail: null,
      metadata: null,
    };

    expect(SafepayCheckoutCommandV1Schema.parse(command)).toEqual(command);
    expect(SafepayCheckoutCommandV1Schema.safeParse({ ...command, money: undefined }).success).toBe(false);
    expect(SafepayCheckoutCommandV1Schema.safeParse({ ...command, money: { amountMinor: '0', currency: 'PKR' } }).success).toBe(false);
    expect(SafepayCheckoutCommandV1Schema.safeParse({ ...command, money: { amountMinor: '5000', currency: '' } }).success).toBe(false);
  });

  it('keeps tracker and payment references distinct and metadata explicitly untrusted', () => {
    const event = {
      provider: 'safepay',
      kind: 'payment.confirmed',
      providerEventId: 'evt_safepay_01',
      occurredAt: '2026-10-04T09:12:44.120Z',
      providerTrackerRef: 'track_895ca125-8bd3-438e-82ea-ce93e5845933',
      providerPaymentRef: null,
      money: { amountMinor: '5000', currency: 'PKR' },
      metadata: null,
    };

    expect(SafepayPaymentEventV1Schema.parse(event)).toEqual(event);
    expect(SafepayPaymentEventV1Schema.safeParse({ ...event, providerTrackerRef: null }).success).toBe(false);
    expect(SafepayPaymentEventV1Schema.safeParse({ ...event, providerEventId: '' }).success).toBe(false);
  });

  it('maps official payment success and refund webhook identities without inventing object refs', () => {
    const successPayload = {
      token: 'evt_64b3218e-f65c-45a9-96b0-fe4e293bb879',
      version: '2.0.0',
      merchant_api_key: 'sec_example',
      type: 'payment.succeeded',
      endpoint: 'http://example.com',
      data: {
        tracker: 'track_06ee38cb-981d-4158-819f-7231f28314e4',
        intent: 'CYBERSOURCE',
        state: 'TRACKER_ENDED',
        net: 43525,
        fee: 1475,
        customer_email: 'hzee@gmail.com',
        amount: 45000,
        currency: 'PKR',
        metadata: { order_id: 'AX-09u812312', source: 'shopify' },
        charged_at: { seconds: 1698754230, nanos: 752997627 },
      },
      created_at: { seconds: 1698754230, nanos: 912705711 },
    };
    const refundPayload = {
      token: 'evt_48431483-2111-4328-8729-309c96c7a0f6',
      version: '2.0.0',
      merchant_api_key: 'sec_example',
      type: 'payment.refunded',
      endpoint: 'http://example.com',
      data: {
        tracker: 'track_06ee38cb-981d-4158-819f-7231f28314e4',
        intent: 'CYBERSOURCE',
        state: 'TRACKER_PARTIAL_REFUND',
        customer_email: 'hzee@gmail.com',
        balance: 44000,
        currency: 'PKR',
        metadata: { order_id: 'AX-09u812312', source: 'shopify' },
        refund_amount: 1000,
        refunded_at: { seconds: 1698758038, nanos: 682810001 },
      },
      created_at: { seconds: 1698758038, nanos: 880931084 },
    };

    const success = SafepayWebhookPayloadV1Schema.parse(successPayload);
    const refund = SafepayWebhookPayloadV1Schema.parse(refundPayload);
    expect(success).toEqual(successPayload);
    expect(refund).toEqual(refundPayload);
    if (success.type !== 'payment.succeeded' || refund.type !== 'payment.refunded') throw new Error('Unexpected Safepay event type');

    const confirmed = {
      provider: 'safepay',
      kind: 'payment.confirmed',
      providerEventId: success.token,
      occurredAt: '2023-10-31T10:50:30.752997627Z',
      providerTrackerRef: success.data.tracker,
      providerPaymentRef: null,
      money: { amountMinor: String(success.data.amount), currency: success.data.currency },
      metadata: success.data.metadata ?? null,
    };
    const refunded = {
      provider: 'safepay',
      kind: 'refund.confirmed',
      providerEventId: refund.token,
      occurredAt: '2023-10-31T11:53:58.682810001Z',
      providerTrackerRef: refund.data.tracker,
      providerPaymentRef: null,
      providerRefundRef: null,
      money: { amountMinor: String(refund.data.refund_amount), currency: refund.data.currency },
      metadata: refund.data.metadata ?? null,
    };
    expect(SafepayPaymentEventV1Schema.parse(confirmed)).toEqual(confirmed);
    expect(SafepayPaymentEventV1Schema.parse(refunded)).toEqual(refunded);
    expect(SafepayWebhookPayloadV1Schema.safeParse({ ...successPayload, data: { ...successPayload.data, tracker: undefined } }).success).toBe(false);
    expect(SafepayWebhookPayloadV1Schema.safeParse({ ...refundPayload, data: { ...refundPayload.data, tracker: undefined } }).success).toBe(false);
    expect(SafepayPaymentEventV1Schema.safeParse({ ...confirmed, providerTrackerRef: null }).success).toBe(false);
    expect(SafepayPaymentEventV1Schema.safeParse({ ...refunded, providerTrackerRef: null }).success).toBe(false);
  });

  it('accepts official payment.failed webhook shape without requiring amount or payment identity', () => {
    const failedPayload = {
      token: 'evt_e7069e13-e4a4-4518-b5ce-ee42e62b6797',
      version: '2.0.0',
      merchant_api_key: 'sec_example',
      type: 'payment.failed',
      endpoint: 'https://example.com/webhooks/safepay',
      data: {
        tracker: 'track_138cf593-3d3f-4d54-b9c6-27a510afb780',
        intent: 'CYBERSOURCE',
        state: 'TRACKER_ENROLLED',
        customer_email: 'hzee@gmail.com',
        metadata: {},
        category: 'PAYMENT_METHOD_ERROR',
        code: 403,
        message: 'The card was declined.',
        failed_at: { seconds: 1698754648, nanos: 494424792 },
      },
      created_at: { seconds: 1698754648, nanos: 589390626 },
    };

    const parsed = SafepayWebhookPayloadV1Schema.parse(failedPayload);
    expect(parsed).toEqual(failedPayload);
    if (parsed.type !== 'payment.failed') throw new Error('Unexpected Safepay event type');

    const event = {
      provider: 'safepay',
      kind: 'payment.failed',
      providerEventId: parsed.token,
      occurredAt: '2023-10-31T10:57:28.494424792Z',
      providerTrackerRef: parsed.data.tracker,
      providerPaymentRef: null,
      errorCode: 'PAYMENT_METHOD_ERROR',
      metadata: parsed.data.metadata ?? null,
    };
    expect(SafepayPaymentEventV1Schema.parse(event)).toEqual(event);
    expect(SafepayWebhookPayloadV1Schema.safeParse({
      ...failedPayload,
      data: { ...failedPayload.data, tracker: undefined },
    }).success).toBe(false);
  });

  it('allows absent provider expiry and refund identity without inventing either', () => {
    const trackerResponse = {
      data: { tracker: {
        token: 'track_895ca125-8bd3-438e-82ea-ce93e5845933',
        environment: 'sandbox',
        state: 'TRACKER_STARTED',
        metadata: {},
      } },
    };
    expect(SafepayCreateTrackerResponseV1Schema.parse(trackerResponse)).toEqual(trackerResponse);

    const session = {
      providerTrackerRef: 'track_895ca125-8bd3-438e-82ea-ce93e5845933',
      checkoutUrl: 'https://sandbox.getsafepay.com/checkout/track_895ca125',
      providerExpiresAt: null,
      applicationPolicyExpiresAt: '2026-10-04T10:12:44.000Z',
    };
    const refund = {
      provider: 'safepay',
      kind: 'refund.confirmed',
      providerEventId: 'evt_safepay_refund_01',
      occurredAt: null,
      providerTrackerRef: 'track_895ca125-8bd3-438e-82ea-ce93e5845933',
      providerPaymentRef: null,
      providerRefundRef: null,
      money: { amountMinor: '1200', currency: 'PKR' },
      metadata: { source: 'provider' },
    };

    expect(SafepayCheckoutSessionV1Schema.parse(session)).toEqual(session);
    expect(SafepayCheckoutSessionV1Schema.safeParse({ ...session, checkoutUrl: null }).success).toBe(false);
    expect(SafepayCheckoutSessionV1Schema.safeParse({ ...session, checkoutUrl: 'http://example.com/checkout' }).success).toBe(false);
    expect(SafepayCheckoutSessionV1Schema.safeParse({ providerTrackerRef: session.providerTrackerRef, checkoutUrl: session.checkoutUrl, providerExpiresAt: null, applicationPolicyExpiresAt: null }).success).toBe(true);
    expect(SafepayCheckoutSessionV1Schema.safeParse({ ...session, providerExpiresAt: undefined }).success).toBe(false);
    const parsedRefund = SafepayPaymentEventV1Schema.parse(refund);
    expect(parsedRefund.kind).toBe('refund.confirmed');
    if (parsedRefund.kind === 'refund.confirmed') {
      expect(parsedRefund.providerPaymentRef).toBeNull();
      expect(parsedRefund.providerRefundRef).toBeNull();
    }
  });

  it('requires a separately configured webhook HMAC secret', () => {
    const credentials = {
      merchantApiKey: 'merchant-key',
      merchantSecret: 'merchant-secret',
      webhookSigningSecret: 'webhook-hmac-secret',
      environment: 'sandbox',
    };

    expect(SafepayCredentialsV1Schema.safeParse(credentials).success).toBe(true);
    expect(SafepayCredentialsV1Schema.safeParse({ ...credentials, webhookSigningSecret: undefined }).success).toBe(false);
  });
});

describe('Telegram notification v1 contracts', () => {
  it('accepts official chat username targets and retains the provider message time', () => {
    const officialResponse = {
      ok: true,
      result: {
        message_id: 42,
        date: 1791105164,
        chat: { id: -1001234567890, type: 'channel', title: 'Example' },
        text: 'A safe plain text notification',
      },
    };
    expect(TelegramSendMessageResponseV1Schema.parse(officialResponse)).toEqual(officialResponse);

    const command = {
      deliveryId: '11111111-1111-4111-8111-111111111111',
      destination: '@example_channel',
      text: 'A safe plain text notification',
    };
    const receipt = {
      provider: 'telegram',
      providerMessageRef: '42',
      providerChatRef: '-1001234567890',
      occurredAt: '2026-10-04T09:12:44.000Z',
    };

    expect(NotificationCommandV1Schema.parse(command)).toEqual(command);
    expect(NotificationReceiptV1Schema.parse(receipt)).toEqual(receipt);
    expect(NotificationReceiptV1Schema.safeParse({ ...receipt, providerMessageRef: '' }).success).toBe(false);
  });
});
