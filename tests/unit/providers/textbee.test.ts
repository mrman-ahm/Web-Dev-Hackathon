import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  TextbeeAdapter,
  type TextbeeCredentials,
  type TextbeeRawWebhook,
} from '../../../src/modules/messaging/adapters/textbee';
import { AdapterVerificationError } from '../../../src/contracts/integrations';
import type { SendMessageCommand } from '../../../src/contracts/integrations';

describe('TextbeeAdapter', () => {
  const credentials: TextbeeCredentials = {
    apiKey: 'test-api-key-12345',
    deviceId: 'device-android-sim-1',
    webhookSecret: 'whsec_textbee_secret_test_key_abc',
    gatewayNumber: '+923001234567',
  };

  const createWebhook = (
    body: object | string,
    secret: string = credentials.webhookSecret,
    customHeaders?: Record<string, string>,
  ): TextbeeRawWebhook => {
    const rawString = typeof body === 'string' ? body : JSON.stringify(body);
    const rawBody = new TextEncoder().encode(rawString);
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const headers = new Headers({
      'content-type': 'application/json',
      'x-signature': signature,
      ...customHeaders,
    });

    return {
      rawBody,
      headers,
      canonicalUrl: 'https://api.crm.example.com/api/webhooks/textbee',
    };
  };

  let adapter: TextbeeAdapter;

  beforeEach(() => {
    adapter = new TextbeeAdapter();
    vi.restoreAllMocks();
  });

  describe('verifyInbound - Webhook Authenticity', () => {
    it('verifies valid signature and accepts matching payload', () => {
      const payload = {
        smsId: 'sms-msg-101',
        message: 'Hello, need information on pricing',
        sender: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_RECEIVED',
        receivedAt: '2026-10-18T10:00:00Z',
      };

      const webhook = createWebhook(payload);
      const result = adapter.verifyInbound(webhook, credentials);

      expect(result.kind).toBe('message.received');
      expect(result.provider).toBe('textbee');
      expect(result.providerMessageRef).toBe('sms-msg-101');
      expect(result.from).toBe('+923331112233');
      expect(result.to).toBe(credentials.gatewayNumber);
      if (result.kind === 'message.received') {
        expect(result.body).toBe('Hello, need information on pricing');
        expect(result.optOut).toBe('none');
      }
    });

    it('rejects tampered signature with INVALID_SIGNATURE', () => {
      const payload = {
        smsId: 'sms-102',
        message: 'Test message',
        sender: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_RECEIVED',
      };

      const webhook = createWebhook(payload, 'wrong-secret');

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects tampered request body with INVALID_SIGNATURE', () => {
      const webhook = createWebhook({ message: 'Original' });
      // Tamper with body bytes after signature generation
      webhook.rawBody = new TextEncoder().encode(JSON.stringify({ message: 'Tampered' }));

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects missing X-Signature header with INVALID_SIGNATURE', () => {
      const webhook = createWebhook({ message: 'Test' });
      webhook.headers.delete('x-signature');

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects malformed signature strings safely without unhandled error', () => {
      const webhook = createWebhook({ message: 'Test' }, credentials.webhookSecret, {
        'x-signature': 'not-a-valid-hex-length!',
      });

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects invalid non-JSON payload with INVALID_PAYLOAD', () => {
      const rawString = 'this is not valid json {{{';
      const webhook = createWebhook(rawString);

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_PAYLOAD');
      }
    });

    it('rejects mismatched deviceId with CONNECTION_MISMATCH', () => {
      const payload = {
        smsId: 'sms-103',
        message: 'Hello',
        sender: '+923331112233',
        deviceId: 'different-rogue-device',
        webhookEvent: 'MESSAGE_RECEIVED',
      };
      const webhook = createWebhook(payload);

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err: unknown) {
        expect((err as AdapterVerificationError).code).toBe('CONNECTION_MISMATCH');
      }
    });
  });

  describe('verifyInbound - Inbound Message Normalization & Opt-Out', () => {
    it('detects STOP keyword and sets optOut to stop', () => {
      const payload = {
        smsId: 'sms-opt-stop',
        message: '  STOP  ',
        sender: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_RECEIVED',
      };

      const result = adapter.verifyInbound(createWebhook(payload), credentials);
      expect(result.kind).toBe('message.received');
      if (result.kind === 'message.received') {
        expect(result.optOut).toBe('stop');
      }
    });

    it('detects START keyword and sets optOut to start', () => {
      const payload = {
        smsId: 'sms-opt-start',
        message: 'start',
        sender: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_RECEIVED',
      };

      const result = adapter.verifyInbound(createWebhook(payload), credentials);
      expect(result.kind).toBe('message.received');
      if (result.kind === 'message.received') {
        expect(result.optOut).toBe('start');
      }
    });

    it('detects HELP keyword and sets optOut to help', () => {
      const payload = {
        smsId: 'sms-opt-help',
        message: 'HELP',
        sender: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_RECEIVED',
      };

      const result = adapter.verifyInbound(createWebhook(payload), credentials);
      expect(result.kind).toBe('message.received');
      if (result.kind === 'message.received') {
        expect(result.optOut).toBe('help');
      }
    });

    it('uses idempotencyKey as providerEventId when present', () => {
      const payload = {
        smsId: 'sms-104',
        message: 'Testing idempotency',
        sender: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_RECEIVED',
        idempotencyKey: 'idemp-custom-key-999',
      };

      const result = adapter.verifyInbound(createWebhook(payload), credentials);
      expect(result.providerEventId).toBe('idemp-custom-key-999');
    });

    it('generates deterministic providerEventId from smsId when idempotencyKey missing', () => {
      const payload = {
        smsId: 'sms-105',
        message: 'Testing deterministic id',
        sender: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_RECEIVED',
      };

      const result1 = adapter.verifyInbound(createWebhook(payload), credentials);
      const result2 = adapter.verifyInbound(createWebhook(payload), credentials);
      expect(result1.providerEventId).toBe(result2.providerEventId);
      expect(result1.providerEventId).toBe('textbee-inbound-sms-105');
    });
  });

  describe('verifyInbound - Delivery Status Callbacks', () => {
    it('normalizes MESSAGE_SENT status event', () => {
      const payload = {
        smsId: 'sms-out-201',
        smsBatchId: 'batch-out-201',
        recipient: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_SENT',
        sentAt: '2026-10-18T10:05:00Z',
      };

      const result = adapter.verifyInbound(createWebhook(payload), credentials);
      expect(result.kind).toBe('message.status');
      if (result.kind === 'message.status') {
        expect(result.state).toBe('sent');
        expect(result.errorCode).toBeNull();
        expect(result.to).toBe('+923331112233');
        expect(result.from).toBe(credentials.gatewayNumber);
      }
    });

    it('normalizes MESSAGE_DELIVERED status event', () => {
      const payload = {
        smsId: 'sms-out-202',
        recipient: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_DELIVERED',
        deliveredAt: '2026-10-18T10:06:00Z',
      };

      const result = adapter.verifyInbound(createWebhook(payload), credentials);
      expect(result.kind).toBe('message.status');
      if (result.kind === 'message.status') {
        expect(result.state).toBe('delivered');
        expect(result.errorCode).toBeNull();
      }
    });

    it('normalizes MESSAGE_FAILED status event with safe error code', () => {
      const payload = {
        smsId: 'sms-out-203',
        recipient: '+923331112233',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'MESSAGE_FAILED',
        errorCode: 'SIM_OUT_OF_CREDIT',
        errorMessage: 'SIM balance depleted',
        failedAt: '2026-10-18T10:07:00Z',
      };

      const result = adapter.verifyInbound(createWebhook(payload), credentials);
      expect(result.kind).toBe('message.status');
      if (result.kind === 'message.status') {
        expect(result.state).toBe('failed');
        expect(result.errorCode).toBe('SIM_OUT_OF_CREDIT');
      }
    });

    it('rejects unsupported webhookEvent with INVALID_PAYLOAD', () => {
      const payload = {
        smsId: 'sms-out-204',
        deviceId: 'device-android-sim-1',
        webhookEvent: 'UNSUPPORTED_RANDOM_EVENT',
      };

      expect(() => adapter.verifyInbound(createWebhook(payload), credentials)).toThrow(
        AdapterVerificationError,
      );
    });
  });

  describe('send - Outbound SMS Submission', () => {
    const sendCommand: SendMessageCommand = {
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      channel: 'sms',
      from: credentials.gatewayNumber,
      to: '+923339998877',
      body: 'Your appointment is confirmed for Monday 10:00 AM.',
      statusCallbackUrl: 'https://api.crm.example.com/api/webhooks/textbee',
    };

    it('successfully submits SMS and returns confirmed outcome with batch reference', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            smsBatchId: 'batch-res-5001',
            status: 'pending',
          },
        }),
      });
      global.fetch = mockFetch;

      const outcome = await adapter.send(sendCommand, credentials);

      expect(outcome.status).toBe('confirmed');
      if (outcome.status === 'confirmed') {
        expect(outcome.reference).toBe('batch-res-5001');
        expect(outcome.value.providerMessageRef).toBe('batch-res-5001');
        expect(outcome.value.state).toBe('sent');
        expect(outcome.value.channel).toBe('sms');
      }

      // Verify request payload and headers
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
      expect(call).toBeDefined();
      const [url, options] = call;
      expect(url).toBe('https://api.textbee.dev/api/v1/gateway/send-sms');
      expect(options.headers['x-api-key']).toBe(credentials.apiKey);
      expect(options.headers['content-type']).toBe('application/json');

      const bodyObj = JSON.parse(options.body);
      expect(bodyObj.recipients).toEqual(['+923339998877']);
      expect(bodyObj.message).toBe(sendCommand.body);
      expect(bodyObj.deviceId).toBe(credentials.deviceId);
    });

    it('maps 429 rate limit to temporary_failure with retryAfterSeconds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '45' }),
        json: async () => ({ message: 'Rate limit exceeded' }),
      });

      const outcome = await adapter.send(sendCommand, credentials);

      expect(outcome.status).toBe('temporary_failure');
      if (outcome.status === 'temporary_failure') {
        expect(outcome.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(outcome.retryAfterSeconds).toBe(45);
      }
    });

    it('maps 503 service unavailable to temporary_failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: async () => ({ message: 'Gateway temporarily unavailable' }),
      });

      const outcome = await adapter.send(sendCommand, credentials);

      expect(outcome.status).toBe('temporary_failure');
      if (outcome.status === 'temporary_failure') {
        expect(outcome.code).toBe('SERVICE_UNAVAILABLE');
      }
    });

    it('maps device offline error to temporary_failure with DEVICE_OFFLINE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ message: 'Target device is offline or disconnected' }),
      });

      const outcome = await adapter.send(sendCommand, credentials);

      expect(outcome.status).toBe('temporary_failure');
      if (outcome.status === 'temporary_failure') {
        expect(outcome.code).toBe('DEVICE_OFFLINE');
      }
    });

    it('maps 401/403 authentication error to permanent_failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ message: 'Invalid API key provided' }),
      });

      const outcome = await adapter.send(sendCommand, credentials);

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('AUTHENTICATION_FAILED');
      }
    });

    it('maps 400 invalid recipient error to permanent_failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ message: 'Invalid phone number formatting' }),
      });

      const outcome = await adapter.send(sendCommand, credentials);

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('INVALID_RECIPIENT');
      }
    });

    it('maps network timeout / fetch abort to unknown outcome with deliveryId reference', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const outcome = await adapter.send(sendCommand, credentials);

      expect(outcome.status).toBe('unknown');
      if (outcome.status === 'unknown') {
        expect(outcome.code).toBe('NETWORK_TIMEOUT');
        expect(outcome.reconciliationReference).toBe(sendCommand.deliveryId);
      }
    });

    it('maps unexpected network failure to unknown outcome', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const outcome = await adapter.send(sendCommand, credentials);

      expect(outcome.status).toBe('unknown');
      if (outcome.status === 'unknown') {
        expect(outcome.code).toBe('NETWORK_ERROR');
        expect(outcome.reconciliationReference).toBe(sendCommand.deliveryId);
      }
    });
  });
});
