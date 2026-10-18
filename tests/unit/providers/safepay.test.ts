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

    it('rejects HMAC-SHA256 signature with INVALID_SIGNATURE per strict merchant HMAC-SHA512 specification', () => {
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
      expect(() => adapter.verifyWebhook(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyWebhook(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('verifies signature with sha512= prefix', () => {
      const payload = {
        token: 'evt_test_03',
        type: 'payment.succeeded',
        created_at: { seconds: 1698754230 },
        data: {
          tracker: 'track_prefix',
          amount: 45000,
          currency: 'PKR',
        },
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

    it('rejects missing or malformed amount with INVALID_PAYLOAD rather than converting to zero', () => {
      const payloadMissingAmount = {
        token: 'evt_no_amount',
        type: 'payment.succeeded',
        created_at: { seconds: 1698754230 },
        data: {
          tracker: 'track_no_amount',
          currency: 'PKR',
        },
      };

      expect(() => adapter.verifyWebhook(createWebhook(payloadMissingAmount), credentials)).toThrow(
        AdapterVerificationError,
      );
      try {
        adapter.verifyWebhook(createWebhook(payloadMissingAmount), credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_PAYLOAD');
      }
    });

    it('rejects invalid negative or non-numeric amount with INVALID_PAYLOAD', () => {
      const payloadBadAmount = {
        token: 'evt_bad_amount',
        type: 'payment.succeeded',
        created_at: { seconds: 1698754230 },
        data: {
          tracker: 'track_bad_amount',
          amount: -500,
          currency: 'PKR',
        },
      };

      expect(() => adapter.verifyWebhook(createWebhook(payloadBadAmount), credentials)).toThrow(
        AdapterVerificationError,
      );
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

    it('returns confirmed outcome with genuine provider tracker token and application-owned expiry policy', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: { message: 'success' },
          data: { token: 'track_order_live_9988' },
        }),
      });

      const before = Date.now();
      const outcome = await adapter.createCheckout(checkoutCommand, credentials);
      const after = Date.now();

      expect(outcome.status).toBe('confirmed');
      if (outcome.status === 'confirmed') {
        expect(outcome.reference).toBe('track_order_live_9988');
        expect(outcome.value.providerSessionRef).toBe('track_order_live_9988');
        expect(outcome.value.checkoutUrl).toBe(
          `https://sandbox.api.getsafepay.com/checkout/pay?beacon=track_order_live_9988&order_id=${checkoutCommand.paymentRequestId}`,
        );
        // Expiry must match application-owned 3600s policy
        const expiryTime = new Date(outcome.value.expiresAt).getTime();
        expect(expiryTime).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000);
        expect(expiryTime).toBeLessThanOrEqual(after + 3600 * 1000 + 1000);
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

  describe('refundPayment - Complete Refund Lifecycle Operations', () => {
    it('returns confirmed outcome for full refund with genuine provider refund reference', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: { message: 'success' },
          data: {
            token: 'rfnd_safepay_full_9988',
            state: 'succeeded',
            amount: 500000,
            currency: 'PKR',
          },
        }),
      });

      const outcome = await adapter.refundPayment(
        {
          tracker: 'track_order_live_9988',
          money: { amountMinor: '500000', currency: 'PKR' },
          reason: 'Customer return',
        },
        credentials,
      );

      expect(outcome.status).toBe('confirmed');
      if (outcome.status === 'confirmed') {
        expect(outcome.reference).toBe('rfnd_safepay_full_9988');
        expect(outcome.value.providerRefundRef).toBe('rfnd_safepay_full_9988');
        expect(outcome.value.tracker).toBe('track_order_live_9988');
        expect(outcome.value.status).toBe('succeeded');
        expect(outcome.value.money.amountMinor).toBe('500000');
        expect(outcome.value.reason).toBe('Customer return');
      }
    });

    it('returns confirmed outcome for partial refund preserving exact minor units', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: { message: 'success' },
          data: {
            token: 'rfnd_safepay_part_1122',
            state: 'succeeded',
            amount: 150000,
            currency: 'PKR',
          },
        }),
      });

      const outcome = await adapter.refundPayment(
        {
          tracker: 'track_order_live_9988',
          money: { amountMinor: '150000', currency: 'PKR' },
          reason: 'Partial discount refund',
        },
        credentials,
      );

      expect(outcome.status).toBe('confirmed');
      if (outcome.status === 'confirmed') {
        expect(outcome.value.providerRefundRef).toBe('rfnd_safepay_part_1122');
        expect(outcome.value.money.amountMinor).toBe('150000');
      }
    });

    it('never treats a pending/requested refund as confirmed refund', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: { message: 'success' },
          data: {
            token: 'rfnd_req_pending_3344',
            state: 'pending',
            amount: 500000,
          },
        }),
      });

      const outcome = await adapter.refundPayment(
        {
          tracker: 'track_order_live_9988',
          money: { amountMinor: '500000', currency: 'PKR' },
        },
        credentials,
      );

      expect(outcome.status).toBe('unknown');
      if (outcome.status === 'unknown') {
        expect(outcome.code).toBe('REFUND_PENDING_CONFIRMATION');
        expect(outcome.reconciliationReference).toBe('rfnd_req_pending_3344');
      }
    });

    it('rejects invalid or empty tracker with permanent_failure', async () => {
      const outcome = await adapter.refundPayment(
        {
          tracker: '   ',
          money: { amountMinor: '500000', currency: 'PKR' },
        },
        credentials,
      );

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('INVALID_TRACKER');
      }
    });

    it('rejects zero or negative refund amount with permanent_failure', async () => {
      const outcome = await adapter.refundPayment(
        {
          tracker: 'track_order_live_9988',
          money: { amountMinor: '0', currency: 'PKR' },
        },
        credentials,
      );

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('INVALID_AMOUNT');
      }
    });

    it('maps Safepay 400/409 duplicate/exceeded refund errors to permanent_failure with specific code', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'ALREADY_REFUNDED',
        }),
      });

      const outcome = await adapter.refundPayment(
        {
          tracker: 'track_order_live_9988',
          money: { amountMinor: '500000', currency: 'PKR' },
        },
        credentials,
      );

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('ALREADY_REFUNDED');
      }
    });

    it('handles network timeouts as unknown outcome for reconciliation', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const outcome = await adapter.refundPayment(
        {
          tracker: 'track_order_live_9988',
          money: { amountMinor: '500000', currency: 'PKR' },
        },
        credentials,
      );

      expect(outcome.status).toBe('unknown');
      if (outcome.status === 'unknown') {
        expect(outcome.code).toBe('NETWORK_TIMEOUT');
        expect(outcome.reconciliationReference).toBe('track_order_live_9988');
      }
    });

    it('handles rate limit 429 with retryAfterSeconds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '45' }),
      });

      const outcome = await adapter.refundPayment(
        {
          tracker: 'track_order_live_9988',
          money: { amountMinor: '500000', currency: 'PKR' },
        },
        credentials,
      );

      expect(outcome.status).toBe('temporary_failure');
      if (outcome.status === 'temporary_failure') {
        expect(outcome.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(outcome.retryAfterSeconds).toBe(45);
      }
    });
  });

  describe('lookupPayment - Payment Reconciliation', () => {
    it('successfully reconciles paid transaction details with minor units and metadata', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: { message: 'success' },
          data: {
            token: 'pay_token_confirmed_123',
            tracker: 'track_rec_456',
            state: 'paid',
            amount: 750000,
            currency: 'PKR',
            metadata: {
              paymentRequestId: '550e8400-e29b-41d4-a716-446655440001',
              contactId: '550e8400-e29b-41d4-a716-446655440002',
              opportunityId: '550e8400-e29b-41d4-a716-446655440003',
            },
          },
        }),
      });

      const outcome = await adapter.lookupPayment('track_rec_456', credentials);

      expect(outcome.status).toBe('confirmed');
      if (outcome.status === 'confirmed') {
        expect(outcome.value.tracker).toBe('track_rec_456');
        expect(outcome.value.state).toBe('paid');
        expect(outcome.value.money.amountMinor).toBe('750000');
        expect(outcome.value.money.currency).toBe('PKR');
        expect(outcome.value.providerPaymentRef).toBe('pay_token_confirmed_123');
        expect(outcome.value.metadata?.paymentRequestId).toBe('550e8400-e29b-41d4-a716-446655440001');
      }
    });

    it('correctly reconciles refunded transaction with amountRefundedMinor', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: { message: 'success' },
          data: {
            tracker: 'track_rec_refunded',
            state: 'refunded',
            amount: 750000,
            refund_amount: 750000,
            currency: 'PKR',
          },
        }),
      });

      const outcome = await adapter.lookupPayment('track_rec_refunded', credentials);

      expect(outcome.status).toBe('confirmed');
      if (outcome.status === 'confirmed') {
        expect(outcome.value.state).toBe('refunded');
        expect(outcome.value.money.amountMinor).toBe('750000');
        expect(outcome.value.amountRefundedMinor).toBe('750000');
      }
    });

    it('returns PAYMENT_NOT_FOUND when Safepay returns 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const outcome = await adapter.lookupPayment('track_unknown_nonexistent', credentials);

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('PAYMENT_NOT_FOUND');
      }
    });
  });
});
