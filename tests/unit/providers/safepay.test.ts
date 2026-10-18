import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  SafepayAdapter,
  type SafepayCredentials,
  type SafepayRawWebhook,
} from '../../../src/modules/payments/adapters/safepay';
import { AdapterVerificationError } from '../../../src/contracts/integrations';
import type { CheckoutCommand } from '../../../src/contracts/integrations';

describe('SafepayAdapter', () => {
  const credentials: SafepayCredentials = {
    apiKey: 'sec_edeade52-46aa-483b-b87d-009d3ce41554',
    v1Secret: 'v1_secret_key_456',
    webhookSecret: 'whsec_safepay_hmac_secret_789',
    mode: 'sandbox',
  };

  const createWebhook = (
    body: object | string,
    secret: string = credentials.webhookSecret,
    customHeaders?: Record<string, string>,
    algorithm: 'sha512' | 'sha256' = 'sha512',
  ): SafepayRawWebhook => {
    const rawString = typeof body === 'string' ? body : JSON.stringify(body);
    const rawBody = new TextEncoder().encode(rawString);
    const signature = crypto.createHmac(algorithm, secret).update(rawBody).digest('hex');

    const headers = new Headers({
      'content-type': 'application/json',
      'x-sfpy-signature': signature,
      ...customHeaders,
    });

    return {
      rawBody,
      headers,
      canonicalUrl: 'https://api.crm.example.com/api/webhooks/safepay',
    };
  };

  let adapter: SafepayAdapter;

  beforeEach(() => {
    adapter = new SafepayAdapter();
    vi.restoreAllMocks();
  });

  describe('verifyWebhook - HMAC Verification and Signature Variants', () => {
    it('verifies valid HMAC-SHA512 signature', () => {
      const payload = {
        token: 'evt_test_01',
        type: 'payment.succeeded',
        created_at: { seconds: 1698754230 },
        data: {
          tracker: 'track_06ee38cb',
          amount: 45000,
          currency: 'PKR',
        },
      };

      const webhook = createWebhook(payload, credentials.webhookSecret, {}, 'sha512');
      const result = adapter.verifyWebhook(webhook, credentials);

      expect(result.provider).toBe('safepay');
      expect(result.kind).toBe('payment.succeeded');
    });

    it('verifies valid HMAC-SHA256 signature when configured on sandbox endpoint', () => {
      const payload = {
        token: 'evt_test_02',
        type: 'payment.succeeded',
        created_at: { seconds: 1698754230 },
        data: {
          tracker: 'track_06ee38cb',
          amount: 45000,
          currency: 'PKR',
        },
      };

      const webhook = createWebhook(payload, credentials.webhookSecret, {}, 'sha256');
      const result = adapter.verifyWebhook(webhook, credentials);

      expect(result.provider).toBe('safepay');
      expect(result.kind).toBe('payment.succeeded');
    });

    it('verifies signature with sha512= prefix', () => {
      const payload = {
        token: 'evt_test_03',
        type: 'payment.succeeded',
        created_at: { seconds: 1698754230 },
        data: { tracker: 'track_prefix' },
      };
      const rawString = JSON.stringify(payload);
      const rawBody = new TextEncoder().encode(rawString);
      const hex = crypto.createHmac('sha512', credentials.webhookSecret).update(rawBody).digest('hex');

      const webhook: SafepayRawWebhook = {
        rawBody,
        headers: new Headers({
          'content-type': 'application/json',
          'x-sfpy-signature': `sha512=${hex}`,
        }),
        canonicalUrl: 'https://api.crm.example.com/api/webhooks/safepay',
      };

      const result = adapter.verifyWebhook(webhook, credentials);
      expect(result.kind).toBe('payment.succeeded');
    });

    it('rejects tampered signature with INVALID_SIGNATURE', () => {
      const webhook = createWebhook({ type: 'payment.succeeded', token: 'evt_1' }, 'wrong-secret');
      expect(() => adapter.verifyWebhook(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyWebhook(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects tampered body with INVALID_SIGNATURE', () => {
      const webhook = createWebhook({ type: 'payment.succeeded', token: 'evt_1' });
      webhook.rawBody = new TextEncoder().encode(JSON.stringify({ type: 'payment.succeeded', token: 'evt_tampered' }));
      expect(() => adapter.verifyWebhook(webhook, credentials)).toThrow(AdapterVerificationError);
    });

    it('rejects missing signature header with INVALID_SIGNATURE', () => {
      const webhook = createWebhook({ type: 'payment.succeeded', token: 'evt_1' });
      webhook.headers.delete('x-sfpy-signature');
      expect(() => adapter.verifyWebhook(webhook, credentials)).toThrow(AdapterVerificationError);
    });
  });

  describe('verifyWebhook - Documented Safepay v2.0.0 Merchant Payloads', () => {
    it('normalizes documented payment.succeeded v2.0.0 payload with genuine timestamp and tracker correlation', () => {
      // Documented Safepay v2.0.0 merchant payload
      const officialPayload = {
        token: 'evt_64b3218e-f65c-45a9-96b0-fe4e293bb879',
        version: '2.0.0',
        merchant_api_key: 'sec_edeade52-46aa-483b-b87d-009d3ce41554',
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
          metadata: {
            order_id: 'AX-09u812312',
            source: 'shopify',
          },
          charged_at: {
            seconds: 1698754230,
            nanos: 752997627,
          },
        },
        created_at: {
          seconds: 1698754230,
          nanos: 912705711,
        },
      };

      const webhook = createWebhook(officialPayload);
      const result = adapter.verifyWebhook(webhook, credentials);

      expect(result.provider).toBe('safepay');
      expect(result.kind).toBe('payment.succeeded');
      expect(result.providerEventId).toBe('evt_64b3218e-f65c-45a9-96b0-fe4e293bb879');
      // Genuine provider timestamp (1698754230 -> 2023-10-31T12:10:30.000Z)
      expect(result.occurredAt).toBe(new Date(1698754230 * 1000).toISOString());

      if (result.kind === 'payment.succeeded') {
        // Trusted tracker correlation
        expect(result.providerPaymentRef).toBe('track_06ee38cb-981d-4158-819f-7231f28314e4');
        expect(result.money.amountMinor).toBe('45000');
        expect(result.money.currency).toBe('PKR');
        // Merchant metadata does not contain internal UUIDs; metadata is null (no fabricated all-zero UUIDs)
        expect(result.metadata).toBeNull();
      }
    });

    it('normalizes documented payment.failed v2.0.0 payload', () => {
      const officialFailedPayload = {
        token: 'evt_e7069e13-e4a4-4518-b5ce-ee42e62b6797',
        version: '2.0.0',
        merchant_api_key: 'sec_edeade52-46aa-483b-b87d-009d3ce41554',
        type: 'payment.failed',
        endpoint: 'http://example.com',
        data: {
          tracker: 'track_138cf593-3d3f-4d54-b9c6-27a510afb780',
          intent: 'CYBERSOURCE',
          state: 'TRACKER_ENROLLED',
          customer_email: 'hzee@gmail.com',
          metadata: {},
          category: 'PAYMENT_METHOD_ERROR',
          code: 403,
          message: 'The card you have used has been flagged as either stolen or lost. ',
          failed_at: {
            seconds: 1698754648,
            nanos: 494424793,
          },
        },
        created_at: {
          seconds: 1698754648,
          nanos: 589390626,
        },
      };

      const webhook = createWebhook(officialFailedPayload);
      const result = adapter.verifyWebhook(webhook, credentials);

      expect(result.kind).toBe('payment.failed');
      expect(result.providerEventId).toBe('evt_e7069e13-e4a4-4518-b5ce-ee42e62b6797');
      expect(result.occurredAt).toBe(new Date(1698754648 * 1000).toISOString());

      if (result.kind === 'payment.failed') {
        expect(result.providerPaymentRef).toBe('track_138cf593-3d3f-4d54-b9c6-27a510afb780');
        expect(result.errorCode).toBe('PAYMENT_METHOD_ERROR');
        expect(result.metadata).toBeNull();
      }
    });

    it('normalizes documented payment.refunded v2.0.0 payload using data.refund_amount', () => {
      const officialRefundedPayload = {
        token: 'evt_48431483-2111-4328-8729-309c96c7a0f6',
        version: '2.0.0',
        merchant_api_key: 'sec_edeade52-46aa-483b-b87d-009d3ce41554',
        type: 'payment.refunded',
        endpoint: 'http://example.com',
        data: {
          tracker: 'track_06ee38cb-981d-4158-819f-7231f28314e4',
          intent: 'CYBERSOURCE',
          state: 'TRACKER_PARTIAL_REFUND',
          customer_email: 'hzee@gmail.com',
          balance: 44000,
          currency: 'PKR',
          metadata: {
            order_id: 'AX-09u812312',
            source: 'shopify',
          },
          refund_amount: 1000,
          refunded_at: {
            seconds: 1698758038,
            nanos: 682810001,
          },
        },
        created_at: {
          seconds: 1698758038,
          nanos: 880931084,
        },
      };

      const webhook = createWebhook(officialRefundedPayload);
      const result = adapter.verifyWebhook(webhook, credentials);

      expect(result.kind).toBe('refund.confirmed');
      expect(result.providerEventId).toBe('evt_48431483-2111-4328-8729-309c96c7a0f6');
      expect(result.occurredAt).toBe(new Date(1698758038 * 1000).toISOString());

      if (result.kind === 'refund.confirmed') {
        expect(result.providerPaymentRef).toBe('track_06ee38cb-981d-4158-819f-7231f28314e4');
        expect(result.providerRefundRef).toBe('evt_48431483-2111-4328-8729-309c96c7a0f6');
        // refund_amount was 1000
        expect(result.money.amountMinor).toBe('1000');
        expect(result.money.currency).toBe('PKR');
      }
    });

    it('never treats a refund request (refund.created / refund.requested) as confirmed refund', () => {
      const refundRequestPayload = {
        token: 'evt_req_refund_01',
        type: 'refund.created',
        created_at: { seconds: 1698758038 },
        data: {
          tracker: 'track_06ee38cb',
          refund_amount: 500,
        },
      };

      const webhook = createWebhook(refundRequestPayload);
      const result = adapter.verifyWebhook(webhook, credentials);

      // Must be ignored, never refund.confirmed
      expect(result.kind).toBe('ignored');
      expect(result.kind).not.toBe('refund.confirmed');
    });

    it('preserves valid internal CheckoutMetadata when provided in webhook', () => {
      const payloadWithInternalMeta = {
        token: 'evt_with_meta_01',
        type: 'payment.succeeded',
        created_at: { seconds: 1698754230 },
        data: {
          tracker: 'track_with_meta',
          amount: 50000,
          currency: 'PKR',
          metadata: {
            paymentRequestId: '550e8400-e29b-41d4-a716-446655440001',
            contactId: '550e8400-e29b-41d4-a716-446655440002',
            opportunityId: '550e8400-e29b-41d4-a716-446655440003',
          },
        },
      };

      const result = adapter.verifyWebhook(createWebhook(payloadWithInternalMeta), credentials);
      expect(result.kind).toBe('payment.succeeded');
      if (result.kind === 'payment.succeeded') {
        expect(result.metadata).not.toBeNull();
        expect(result.metadata?.paymentRequestId).toBe('550e8400-e29b-41d4-a716-446655440001');
      }
    });
  });

  describe('createCheckout - Session Creation and Reference Handling', () => {
    const validMetadata = {
      paymentRequestId: '550e8400-e29b-41d4-a716-446655440001',
      contactId: '550e8400-e29b-41d4-a716-446655440002',
      opportunityId: '550e8400-e29b-41d4-a716-446655440003',
    };

    const checkoutCommand: CheckoutCommand = {
      paymentRequestId: validMetadata.paymentRequestId,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440099',
      money: {
        amountMinor: '250000',
        currency: 'PKR',
      },
      description: 'Consultation & Service Fee',
      customerEmail: 'customer@example.pk',
      metadata: validMetadata,
      successUrl: 'https://crm.example.com/payments/success',
      cancelUrl: 'https://crm.example.com/payments/cancel',
    };

    it('returns confirmed outcome with genuine provider tracker token', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: { message: 'success' },
          data: { token: 'track_order_live_9988' },
        }),
      });

      const outcome = await adapter.createCheckout(checkoutCommand, credentials);
      expect(outcome.status).toBe('confirmed');
      if (outcome.status === 'confirmed') {
        expect(outcome.reference).toBe('track_order_live_9988');
        expect(outcome.value.providerSessionRef).toBe('track_order_live_9988');
        expect(outcome.value.checkoutUrl).toContain('beacon=track_order_live_9988');
      }
    });

    it('returns unknown outcome when provider response is missing reference without fake ID', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: { message: 'success' },
          data: {}, // Missing token
        }),
      });

      const outcome = await adapter.createCheckout(checkoutCommand, credentials);
      expect(outcome.status).toBe('unknown');
      if (outcome.status === 'unknown') {
        expect(outcome.code).toBe('MISSING_PROVIDER_REFERENCE');
        expect(outcome.reconciliationReference).toBe(checkoutCommand.paymentRequestId);
      }
    });
  });
});
