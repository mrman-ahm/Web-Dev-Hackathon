import { describe, expect, it } from 'vitest';
import {
  NotificationCommandV1Schema,
  NotificationReceiptV1Schema,
  SafepayCheckoutCommandV1Schema,
  SafepayCheckoutSessionV1Schema,
  SafepayCreateTrackerPayloadV1Schema,
  SafepayCreateTrackerResponseV1Schema,
  SafepayPaymentEventV1Schema,
  SmsSendCommandV1Schema,
  SmsWebhookEventV1Schema,
  TelegramSendMessageResponseV1Schema,
  TextbeeWebhookPayloadV1Schema,
} from '../../src/contracts/integrations';

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
      providerPaymentRef: 'pay_65e7c183-1404-44e2-b2ef-1fbf46bfc1c8',
      money: { amountMinor: '5000', currency: 'PKR' },
      metadata: null,
    };

    expect(SafepayPaymentEventV1Schema.parse(event)).toEqual(event);
    expect(SafepayPaymentEventV1Schema.safeParse({ ...event, providerPaymentRef: event.providerTrackerRef }).success).toBe(true);
    expect(SafepayPaymentEventV1Schema.safeParse({ ...event, providerEventId: '' }).success).toBe(false);
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
      expiresAt: null,
    };
    const refund = {
      provider: 'safepay',
      kind: 'refund.confirmed',
      providerEventId: 'evt_safepay_refund_01',
      occurredAt: null,
      providerTrackerRef: 'track_895ca125-8bd3-438e-82ea-ce93e5845933',
      providerPaymentRef: 'pay_65e7c183-1404-44e2-b2ef-1fbf46bfc1c8',
      providerRefundRef: null,
      money: { amountMinor: '1200', currency: 'PKR' },
      metadata: { source: 'provider' },
    };

    expect(SafepayCheckoutSessionV1Schema.parse(session)).toEqual(session);
    const parsedRefund = SafepayPaymentEventV1Schema.parse(refund);
    expect(parsedRefund.kind).toBe('refund.confirmed');
    if (parsedRefund.kind === 'refund.confirmed') expect(parsedRefund.providerRefundRef).toBeNull();
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
