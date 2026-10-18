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
    apiKey: 'sec_test_client_key_123',
    v1Secret: 'v1_secret_key_456',
    webhookSecret: 'whsec_safepay_hmac_secret_789',
    mode: 'sandbox',
  };

  const createWebhook = (
    body: object | string,
    secret: string = credentials.webhookSecret,
    customHeaders?: Record<string, string>,
  ): SafepayRawWebhook => {
    const rawString = typeof body === 'string' ? body : JSON.stringify(body);
    const rawBody = new TextEncoder().encode(rawString);
    const signature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');

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

  describe('verifyWebhook - HMAC-SHA512 Signature & Authenticity', () => {
    it('verifies valid HMAC-SHA512 signature and normalizes payment.succeeded', () => {
      const payload = {
        token: 'evt_token_001',
        type: 'payment.succeeded',
        data: {
          token: 'pay_token_999',
          tracker: 'track_session_888',
          amount: '150000', // 1500.00 PKR in minor units
          currency: 'PKR',
          metadata: {
            paymentRequestId: '550e8400-e29b-41d4-a716-446655440001',
            contactId: '550e8400-e29b-41d4-a716-446655440002',
            opportunityId: '550e8400-e29b-41d4-a716-446655440003',
          },
        },
      };

      const webhook = createWebhook(payload);
      const result = adapter.verifyWebhook(webhook, credentials);

      expect(result.provider).toBe('safepay');
      expect(result.kind).toBe('payment.succeeded');
      if (result.kind === 'payment.succeeded') {
        expect(result.providerPaymentRef).toBe('pay_token_999');
        expect(result.money.amountMinor).toBe('150000');
        expect(result.money.currency).toBe('PKR');
        expect(result.metadata.paymentRequestId).toBe('550e8400-e29b-41d4-a716-446655440001');
      }
    });

    it('rejects tampered signature with INVALID_SIGNATURE', () => {
      const payload = { type: 'payment.succeeded', token: 'evt_1' };
      const webhook = createWebhook(payload, 'wrong-webhook-secret');

      expect(() => adapter.verifyWebhook(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyWebhook(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects tampered raw body bytes with INVALID_SIGNATURE', () => {
      const webhook = createWebhook({ type: 'payment.succeeded' });
      webhook.rawBody = new TextEncoder().encode(JSON.stringify({ type: 'payment.succeeded', tampered: true }));

      expect(() => adapter.verifyWebhook(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyWebhook(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects missing X-SFPY-SIGNATURE header with INVALID_SIGNATURE', () => {
      const webhook = createWebhook({ type: 'payment.succeeded' });
      webhook.headers.delete('x-sfpy-signature');

      expect(() => adapter.verifyWebhook(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyWebhook(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects malformed signature strings safely without uncaught exception', () => {
      const webhook = createWebhook({ type: 'payment.succeeded' }, credentials.webhookSecret, {
        'x-sfpy-signature': 'invalid-not-hex-odd-length',
      });

      expect(() => adapter.verifyWebhook(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyWebhook(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects non-JSON payload with INVALID_PAYLOAD', () => {
      const webhook = createWebhook('invalid non-json string content <<>>');

      expect(() => adapter.verifyWebhook(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyWebhook(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_PAYLOAD');
      }
    });
  });

  describe('verifyWebhook - Event Normalization', () => {
    const validMetadata = {
      paymentRequestId: '550e8400-e29b-41d4-a716-446655440001',
      contactId: '550e8400-e29b-41d4-a716-446655440002',
      opportunityId: '550e8400-e29b-41d4-a716-446655440003',
    };

    it('normalizes payment.failed with safe error code and metadata', () => {
      const payload = {
        token: 'evt_failed_01',
        type: 'payment.failed',
        data: {
          token: 'pay_token_fail_1',
          tracker: 'track_fail_1',
          error_code: 'INSUFFICIENT_FUNDS',
          metadata: validMetadata,
        },
      };

      const result = adapter.verifyWebhook(createWebhook(payload), credentials);
      expect(result.kind).toBe('payment.failed');
      if (result.kind === 'payment.failed') {
        expect(result.providerPaymentRef).toBe('pay_token_fail_1');
        expect(result.errorCode).toBe('INSUFFICIENT_FUNDS');
        expect(result.metadata.paymentRequestId).toBe(validMetadata.paymentRequestId);
      }
    });

    it('normalizes refund.completed / refund.confirmed', () => {
      const payload = {
        token: 'evt_refund_01',
        type: 'refund.completed',
        data: {
          token: 'pay_token_ref_1',
          refund_token: 'ref_token_777',
          amount: '50000',
          currency: 'PKR',
          metadata: validMetadata,
        },
      };

      const result = adapter.verifyWebhook(createWebhook(payload), credentials);
      expect(result.kind).toBe('refund.confirmed');
      if (result.kind === 'refund.confirmed') {
        expect(result.providerPaymentRef).toBe('pay_token_ref_1');
        expect(result.providerRefundRef).toBe('ref_token_777');
        expect(result.money.amountMinor).toBe('50000');
        expect(result.money.currency).toBe('PKR');
      }
    });

    it('normalizes checkout.completed event', () => {
      const payload = {
        token: 'evt_chk_01',
        type: 'checkout.completed',
        data: {
          tracker: 'track_chk_99',
          token: 'pay_token_chk_99',
          payment_status: 'paid',
          amount: '200000',
          currency: 'PKR',
          metadata: validMetadata,
        },
      };

      const result = adapter.verifyWebhook(createWebhook(payload), credentials);
      expect(result.kind).toBe('checkout.completed');
      if (result.kind === 'checkout.completed') {
        expect(result.providerSessionRef).toBe('track_chk_99');
        expect(result.providerPaymentRef).toBe('pay_token_chk_99');
        expect(result.paymentStatus).toBe('paid');
        expect(result.money.amountMinor).toBe('200000');
      }
    });

    it('normalizes unknown event type as ignored without crashing', () => {
      const payload = {
        token: 'evt_custom_99',
        type: 'customer.identified_unhandled_type',
        data: {},
      };

      const result = adapter.verifyWebhook(createWebhook(payload), credentials);
      expect(result.kind).toBe('ignored');
      if (result.kind === 'ignored') {
        expect(result.providerEventType).toBe('customer.identified_unhandled_type');
      }
    });
  });

  describe('createCheckout - Safepay Sandbox Session Creation', () => {
    const validMetadata = {
      paymentRequestId: '550e8400-e29b-41d4-a716-446655440001',
      contactId: '550e8400-e29b-41d4-a716-446655440002',
      opportunityId: '550e8400-e29b-41d4-a716-446655440003',
    };

    const checkoutCommand: CheckoutCommand = {
      paymentRequestId: validMetadata.paymentRequestId,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440099',
      money: {
        amountMinor: '250000', // 2500 PKR
        currency: 'PKR',
      },
      description: 'Consultation & Service Fee',
      customerEmail: 'customer@example.pk',
      metadata: validMetadata,
      successUrl: 'https://crm.example.com/payments/success',
      cancelUrl: 'https://crm.example.com/payments/cancel',
    };

    it('initializes checkout order in sandbox and returns confirmed session', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: { message: 'success', errors: [] },
          data: {
            token: 'track_order_token_abc123',
          },
        }),
      });
      global.fetch = mockFetch;

      const outcome = await adapter.createCheckout(checkoutCommand, credentials);

      expect(outcome.status).toBe('confirmed');
      if (outcome.status === 'confirmed') {
        expect(outcome.reference).toBe('track_order_token_abc123');
        expect(outcome.value.providerSessionRef).toBe('track_order_token_abc123');
        expect(outcome.value.checkoutUrl).toContain('beacon=track_order_token_abc123');
        expect(outcome.value.checkoutUrl).toContain('https://');
        expect(outcome.value.expiresAt).toBeDefined();
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
      expect(call).toBeDefined();
      const [url, options] = call;
      expect(url).toContain('/order/v1/init');
      expect(options.headers['x-sfpy-merchant-secret']).toBe(credentials.v1Secret);

      const reqBody = JSON.parse(options.body);
      expect(reqBody.client).toBe(credentials.apiKey);
      expect(reqBody.environment).toBe('sandbox');
      expect(reqBody.currency).toBe('PKR');
    });

    it('maps 429 rate limit to temporary_failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '30' }),
        json: async () => ({ message: 'Too many requests' }),
      });

      const outcome = await adapter.createCheckout(checkoutCommand, credentials);

      expect(outcome.status).toBe('temporary_failure');
      if (outcome.status === 'temporary_failure') {
        expect(outcome.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(outcome.retryAfterSeconds).toBe(30);
      }
    });

    it('maps 503 gateway unavailable to temporary_failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: async () => ({ message: 'Service unavailable' }),
      });

      const outcome = await adapter.createCheckout(checkoutCommand, credentials);

      expect(outcome.status).toBe('temporary_failure');
      if (outcome.status === 'temporary_failure') {
        expect(outcome.code).toBe('GATEWAY_ERROR');
      }
    });

    it('maps 401/403 authentication error to permanent_failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ message: 'Invalid merchant credentials' }),
      });

      const outcome = await adapter.createCheckout(checkoutCommand, credentials);

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('AUTHENTICATION_FAILED');
      }
    });

    it('maps 400 validation error to permanent_failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ message: 'Invalid currency specified' }),
      });

      const outcome = await adapter.createCheckout(checkoutCommand, credentials);

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('INVALID_REQUEST');
      }
    });

    it('maps network timeout to unknown outcome with paymentRequestId reference', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const outcome = await adapter.createCheckout(checkoutCommand, credentials);

      expect(outcome.status).toBe('unknown');
      if (outcome.status === 'unknown') {
        expect(outcome.code).toBe('NETWORK_TIMEOUT');
        expect(outcome.reconciliationReference).toBe(checkoutCommand.paymentRequestId);
      }
    });

    it('maps network fetch failure to unknown outcome', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const outcome = await adapter.createCheckout(checkoutCommand, credentials);

      expect(outcome.status).toBe('unknown');
      if (outcome.status === 'unknown') {
        expect(outcome.code).toBe('NETWORK_ERROR');
        expect(outcome.reconciliationReference).toBe(checkoutCommand.paymentRequestId);
      }
    });
  });
});
