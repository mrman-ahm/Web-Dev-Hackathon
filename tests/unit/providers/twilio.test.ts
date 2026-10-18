import { describe, expect, it, vi } from 'vitest';
import twilio from 'twilio';
import { TwilioMessagingAdapter } from '@/modules/messaging/adapters/twilio';
import {
  AdapterVerificationError,
  RawWebhook,
  SendMessageCommand,
  TwilioCredentials,
  VerifiedMessageEventSchema,
} from '@/contracts/integrations';

describe('TwilioMessagingAdapter', () => {
  const credentials: TwilioCredentials = {
    accountSid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    authToken: 'secret_auth_token_1234567890abcdef',
    channel: 'sms',
    from: '+15550001111',
  };

  const whatsappCredentials: TwilioCredentials = {
    accountSid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    authToken: 'secret_auth_token_1234567890abcdef',
    channel: 'whatsapp',
    from: '+15550001111',
  };

  const canonicalUrl = 'https://api.example.com/api/webhooks/twilio';

  function createSignedFormWebhook(
    params: Record<string, string>,
    url = canonicalUrl,
    token = credentials.authToken,
    customHeaders?: Record<string, string>,
  ): RawWebhook {
    const signature = twilio.getExpectedTwilioSignature(token, url, params);
    const bodyStr = new URLSearchParams(params).toString();
    const rawBody = new TextEncoder().encode(bodyStr);

    const headers = new Headers({
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
      ...customHeaders,
    });

    return {
      rawBody,
      headers,
      canonicalUrl: url,
    };
  }

  describe('verifyInbound - signatures and validation', () => {
    it('verifies a valid inbound SMS webhook signature and normalizes payload', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: credentials.from,
        Body: 'Hello world',
        SmsStatus: 'received',
      };

      const webhook = createSignedFormWebhook(params);
      const event = adapter.verifyInbound(webhook, credentials);

      expect(event).toEqual({
        provider: 'twilio',
        kind: 'message.received',
        providerEventId: 'SM11111111111111111111111111111111',
        providerMessageRef: 'SM11111111111111111111111111111111',
        accountSid: credentials.accountSid,
        channel: 'sms',
        from: '+15559998888',
        to: credentials.from,
        body: 'Hello world',
        optOut: 'none',
      });

      expect(VerifiedMessageEventSchema.safeParse(event).success).toBe(true);
    });

    it('verifies a valid inbound WhatsApp webhook with phone prefix normalization', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM22222222222222222222222222222222',
        AccountSid: whatsappCredentials.accountSid,
        From: 'whatsapp:+15559998888',
        To: `whatsapp:${whatsappCredentials.from}`,
        Body: 'WhatsApp message',
        SmsStatus: 'received',
      };

      const webhook = createSignedFormWebhook(params, canonicalUrl, whatsappCredentials.authToken);
      const event = adapter.verifyInbound(webhook, whatsappCredentials);

      expect(event).toEqual({
        provider: 'twilio',
        kind: 'message.received',
        providerEventId: 'SM22222222222222222222222222222222',
        providerMessageRef: 'SM22222222222222222222222222222222',
        accountSid: whatsappCredentials.accountSid,
        channel: 'whatsapp',
        from: '+15559998888',
        to: whatsappCredentials.from,
        body: 'WhatsApp message',
        optOut: 'none',
      });

      expect(VerifiedMessageEventSchema.safeParse(event).success).toBe(true);
    });

    it('rejects modified webhook body (tampering detection)', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: credentials.from,
        Body: 'Original text',
      };

      const webhook = createSignedFormWebhook(params);
      // Alter the body after signing
      const tamperedParams = { ...params, Body: 'Tampered text' };
      webhook.rawBody = new TextEncoder().encode(new URLSearchParams(tamperedParams).toString());

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect(err).toBeInstanceOf(AdapterVerificationError);
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects incorrect signature', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: credentials.from,
        Body: 'Hello',
      };

      const webhook = createSignedFormWebhook(params, canonicalUrl, credentials.authToken, {
        'x-twilio-signature': 'forged_invalid_signature_value',
      });

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects missing signature header', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: credentials.from,
        Body: 'Hello',
      };

      const signature = twilio.getExpectedTwilioSignature(credentials.authToken, canonicalUrl, params);
      void signature;
      const bodyStr = new URLSearchParams(params).toString();
      const webhook: RawWebhook = {
        rawBody: new TextEncoder().encode(bodyStr),
        headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
        canonicalUrl,
      };

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects request with incorrect configured destination (canonicalUrl mismatch)', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: credentials.from,
        Body: 'Hello',
      };

      // Attacker signed for https://other.example.com/webhook
      const webhook = createSignedFormWebhook(params, 'https://other.example.com/webhook');
      // But configured canonical URL is canonicalUrl
      webhook.canonicalUrl = canonicalUrl;

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_SIGNATURE');
      }
    });

    it('rejects unsupported content type', () => {
      const adapter = new TwilioMessagingAdapter();
      const webhook: RawWebhook = {
        rawBody: new TextEncoder().encode('unsupported body'),
        headers: new Headers({
          'content-type': 'multipart/form-data',
          'x-twilio-signature': 'some_sig',
        }),
        canonicalUrl,
      };

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('UNSUPPORTED_CONTENT_TYPE');
      }
    });
  });

  describe('verifyInbound - connection and account validation', () => {
    it('rejects webhook when AccountSid does not match configured credentials', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: 'ACbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', // Different account
        From: '+15559998888',
        To: credentials.from,
        Body: 'Hello',
      };

      const webhook = createSignedFormWebhook(params);

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('CONNECTION_MISMATCH');
      }
    });

    it('rejects inbound message when To phone number does not match configured credentials.from', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: '+15550009999', // Not our configured number
        Body: 'Hello',
      };

      const webhook = createSignedFormWebhook(params);

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('CONNECTION_MISMATCH');
      }
    });

    it('rejects status callback when From phone number does not match credentials.from', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15550009999', // Does not match our sender number
        To: '+15559998888',
        MessageStatus: 'delivered',
      };

      const webhook = createSignedFormWebhook(params);

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('CONNECTION_MISMATCH');
      }
    });

    it('rejects channel mismatch when SMS credentials receive WhatsApp prefix or vice versa', () => {
      const adapter = new TwilioMessagingAdapter();
      // SMS credentials receiving WhatsApp formatted request
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: 'whatsapp:+15559998888',
        To: `whatsapp:${credentials.from}`,
        Body: 'Hello',
      };

      const webhook = createSignedFormWebhook(params);

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('CONNECTION_MISMATCH');
      }
    });
  });

  describe('verifyInbound - opt-out keyword normalization', () => {
    it.each([
      ['STOP', 'stop'],
      ['stop', 'stop'],
      ['Stop', 'stop'],
      ['STOPALL', 'stop'],
      ['unsubscribe', 'stop'],
      ['CANCEL', 'stop'],
      ['end', 'stop'],
      ['QUIT', 'stop'],
      ['START', 'start'],
      ['start', 'start'],
      ['YES', 'start'],
      ['unstop', 'start'],
      ['HELP', 'help'],
      ['help', 'help'],
      ['INFO', 'help'],
      ['normal question', 'none'],
    ])('normalizes message text "%s" to optOut "%s"', (body, expectedOptOut) => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: credentials.from,
        Body: body,
      };

      const webhook = createSignedFormWebhook(params);
      const event = adapter.verifyInbound(webhook, credentials);
      expect(event.kind).toBe('message.received');
      if (event.kind === 'message.received') {
        expect(event.optOut).toBe(expectedOptOut);
      }
    });

    it('prioritizes explicit OptOutType parameter over body text', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: credentials.from,
        Body: 'Please do not message me again',
        OptOutType: 'STOP',
      };

      const webhook = createSignedFormWebhook(params);
      const event = adapter.verifyInbound(webhook, credentials);
      expect(event.kind).toBe('message.received');
      if (event.kind === 'message.received') {
        expect(event.optOut).toBe('stop');
      }
    });
  });

  describe('verifyInbound - delivery status callbacks & determinism', () => {
    it.each([
      ['queued', 'pending', null],
      ['sending', 'pending', null],
      ['accepted', 'pending', null],
      ['sent', 'sent', null],
      ['delivered', 'delivered', null],
      ['read', 'delivered', null],
      ['undelivered', 'failed', '30008'],
      ['failed', 'failed', '30001'],
    ])(
      'normalizes status "%s" to state "%s" with errorCode "%s"',
      (twilioStatus, expectedState, errorCode) => {
        const adapter = new TwilioMessagingAdapter();
        const params: Record<string, string> = {
          MessageSid: 'SM33333333333333333333333333333333',
          AccountSid: credentials.accountSid,
          From: credentials.from,
          To: '+15559998888',
          MessageStatus: twilioStatus,
        };
        if (errorCode) {
          params.ErrorCode = errorCode;
        }

        const webhook = createSignedFormWebhook(params);
        const event = adapter.verifyInbound(webhook, credentials);

        expect(event.kind).toBe('message.status');
        if (event.kind === 'message.status') {
          expect(event.state).toBe(expectedState);
          expect(event.errorCode).toBe(errorCode);
          expect(event.providerMessageRef).toBe('SM33333333333333333333333333333333');
          expect(event.from).toBe(credentials.from);
          expect(event.to).toBe('+15559998888');
          expect(event.channel).toBe('sms');
        }

        expect(VerifiedMessageEventSchema.safeParse(event).success).toBe(true);
      },
    );

    it('generates deterministic event identifier for deduplication across duplicate callbacks', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM33333333333333333333333333333333',
        AccountSid: credentials.accountSid,
        From: credentials.from,
        To: '+15559998888',
        MessageStatus: 'delivered',
      };

      const webhook1 = createSignedFormWebhook(params);
      const webhook2 = createSignedFormWebhook(params);

      const event1 = adapter.verifyInbound(webhook1, credentials);
      const event2 = adapter.verifyInbound(webhook2, credentials);

      expect(event1.providerEventId).toBe(event2.providerEventId);
      expect(event1.providerEventId).toBe('SM33333333333333333333333333333333:delivered');
    });

    it('distinguishes event identifiers between different status states and error codes', () => {
      const adapter = new TwilioMessagingAdapter();
      const baseParams = {
        MessageSid: 'SM33333333333333333333333333333333',
        AccountSid: credentials.accountSid,
        From: credentials.from,
        To: '+15559998888',
      };

      const sentEvent = adapter.verifyInbound(
        createSignedFormWebhook({ ...baseParams, MessageStatus: 'sent' }),
        credentials,
      );
      const deliveredEvent = adapter.verifyInbound(
        createSignedFormWebhook({ ...baseParams, MessageStatus: 'delivered' }),
        credentials,
      );
      const failedEvent = adapter.verifyInbound(
        createSignedFormWebhook({ ...baseParams, MessageStatus: 'failed', ErrorCode: '30008' }),
        credentials,
      );

      expect(sentEvent.providerEventId).not.toBe(deliveredEvent.providerEventId);
      expect(deliveredEvent.providerEventId).not.toBe(failedEvent.providerEventId);
      expect(failedEvent.providerEventId).toBe('SM33333333333333333333333333333333:failed:30008');
    });
  });

  describe('verifyInbound - malformed payloads and security', () => {
    it('rejects payloads missing MessageSid or From or To', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        AccountSid: credentials.accountSid,
        Body: 'Hello missing fields',
      };

      const webhook = createSignedFormWebhook(params);

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_PAYLOAD');
      }
    });

    it('rejects malformed phone numbers that fail E.164 regex', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: 'invalid-phone',
        To: credentials.from,
        Body: 'Hello',
      };

      const webhook = createSignedFormWebhook(params);

      expect(() => adapter.verifyInbound(webhook, credentials)).toThrow(AdapterVerificationError);
      try {
        adapter.verifyInbound(webhook, credentials);
      } catch (err) {
        expect((err as AdapterVerificationError).code).toBe('INVALID_PAYLOAD');
      }
    });

    it('verifies valid JSON signed webhook with bodySHA256', () => {
      const adapter = new TwilioMessagingAdapter();
      const payload = {
        MessageSid: 'SM44444444444444444444444444444444',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: credentials.from,
        Body: 'JSON message',
      };

      const bodyStr = JSON.stringify(payload);
      const bodyHash = twilio.getExpectedBodyHash(bodyStr);
      const urlWithHash = `${canonicalUrl}?bodySHA256=${encodeURIComponent(bodyHash)}`;
      const signature = twilio.getExpectedTwilioSignature(credentials.authToken, urlWithHash, {});

      const webhook: RawWebhook = {
        rawBody: new TextEncoder().encode(bodyStr),
        headers: new Headers({
          'content-type': 'application/json',
          'x-twilio-signature': signature,
        }),
        canonicalUrl: urlWithHash,
      };

      const event = adapter.verifyInbound(webhook, credentials);
      expect(event.kind).toBe('message.received');
      if (event.kind === 'message.received') {
        expect(event.body).toBe('JSON message');
      }
    });

    it('never leaks auth tokens, sensitive parameters, or raw bodies in AdapterVerificationError', () => {
      const adapter = new TwilioMessagingAdapter();
      const params = {
        MessageSid: 'SM11111111111111111111111111111111',
        AccountSid: credentials.accountSid,
        From: '+15559998888',
        To: credentials.from,
        Body: 'Sensitive customer secret data',
      };

      const webhook = createSignedFormWebhook(params, canonicalUrl, 'wrong_token');

      try {
        adapter.verifyInbound(webhook, credentials);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AdapterVerificationError);
        const error = err as AdapterVerificationError;
        expect(error.message).not.toContain(credentials.authToken);
        expect(error.message).not.toContain('Sensitive customer secret data');
        expect(error.cause).toBeUndefined();
      }
    });
  });

  describe('send - outgoing message submission', () => {
    const validCommand: SendMessageCommand = {
      deliveryId: '550e8400-e29b-41d4-a716-446655440000',
      channel: 'sms',
      from: credentials.from,
      to: '+15559998888',
      body: 'Outgoing test message',
      statusCallbackUrl: 'https://api.example.com/api/webhooks/twilio/status',
    };

    it('successfully submits outgoing SMS and returns confirmed outcome', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        sid: 'SM55555555555555555555555555555555',
        status: 'queued',
      });

      const adapter = new TwilioMessagingAdapter(() => ({
        messages: { create: mockCreate },
      }));

      const outcome = await adapter.send(validCommand, credentials);

      expect(mockCreate).toHaveBeenCalledWith({
        from: credentials.from,
        to: '+15559998888',
        body: 'Outgoing test message',
        statusCallback: 'https://api.example.com/api/webhooks/twilio/status',
      });

      expect(outcome).toEqual({
        status: 'confirmed',
        value: {
          providerMessageRef: 'SM55555555555555555555555555555555',
          state: 'pending',
          channel: 'sms',
        },
        reference: 'SM55555555555555555555555555555555',
      });
    });

    it('successfully submits outgoing WhatsApp message with whatsapp: prefix', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        sid: 'SM66666666666666666666666666666666',
        status: 'sent',
      });

      const adapter = new TwilioMessagingAdapter(() => ({
        messages: { create: mockCreate },
      }));

      const whatsappCommand: SendMessageCommand = {
        ...validCommand,
        channel: 'whatsapp',
        from: whatsappCredentials.from,
      };

      const outcome = await adapter.send(whatsappCommand, whatsappCredentials);

      expect(mockCreate).toHaveBeenCalledWith({
        from: `whatsapp:${whatsappCredentials.from}`,
        to: 'whatsapp:+15559998888',
        body: 'Outgoing test message',
        statusCallback: 'https://api.example.com/api/webhooks/twilio/status',
      });

      expect(outcome).toEqual({
        status: 'confirmed',
        value: {
          providerMessageRef: 'SM66666666666666666666666666666666',
          state: 'sent',
          channel: 'whatsapp',
        },
        reference: 'SM66666666666666666666666666666666',
      });
    });

    it('maps Twilio rate limits (429 / code 20429) to temporary_failure', async () => {
      const restError = Object.assign(new Error('Too Many Requests'), {
        status: 429,
        code: 20429,
        headers: { 'retry-after': '30' },
      });

      const adapter = new TwilioMessagingAdapter(() => ({
        messages: { create: vi.fn().mockRejectedValue(restError) },
      }));

      const outcome = await adapter.send(validCommand, credentials);

      expect(outcome).toEqual({
        status: 'temporary_failure',
        code: 'RATE_LIMIT',
        retryAfterSeconds: 30,
      });
    });

    it('maps 5xx server errors to temporary_failure', async () => {
      const restError = Object.assign(new Error('Internal Server Error'), {
        status: 503,
        code: 50000,
      });

      const adapter = new TwilioMessagingAdapter(() => ({
        messages: { create: vi.fn().mockRejectedValue(restError) },
      }));

      const outcome = await adapter.send(validCommand, credentials);

      expect(outcome).toEqual({
        status: 'temporary_failure',
        code: 'PROVIDER_ERROR',
      });
    });

    it('maps 400 invalid recipient phone number to permanent_failure', async () => {
      const restError = Object.assign(new Error('The To number is not a valid phone number'), {
        status: 400,
        code: 21211,
      });

      const adapter = new TwilioMessagingAdapter(() => ({
        messages: { create: vi.fn().mockRejectedValue(restError) },
      }));

      const outcome = await adapter.send(validCommand, credentials);

      expect(outcome).toEqual({
        status: 'permanent_failure',
        code: 'INVALID_DESTINATION',
      });
    });

    it('maps 401 authentication error to permanent_failure', async () => {
      const restError = Object.assign(new Error('Authenticate'), {
        status: 401,
        code: 20003,
      });

      const adapter = new TwilioMessagingAdapter(() => ({
        messages: { create: vi.fn().mockRejectedValue(restError) },
      }));

      const outcome = await adapter.send(validCommand, credentials);

      expect(outcome).toEqual({
        status: 'permanent_failure',
        code: 'AUTHENTICATION_FAILED',
      });
    });

    it('maps network timeout to unknown outcome', async () => {
      const timeoutError = Object.assign(new Error('Connection timeout while submitting to Twilio'), {
        code: 'ETIMEDOUT',
      });

      const adapter = new TwilioMessagingAdapter(() => ({
        messages: { create: vi.fn().mockRejectedValue(timeoutError) },
      }));

      const outcome = await adapter.send(validCommand, credentials);

      expect(outcome).toEqual({
        status: 'unknown',
        code: 'NETWORK_TIMEOUT',
      });
    });

    it('maps network connection abort / reset to unknown outcome', async () => {
      const abortError = Object.assign(new Error('The operation was aborted'), {
        name: 'AbortError',
      });

      const adapter = new TwilioMessagingAdapter(() => ({
        messages: { create: vi.fn().mockRejectedValue(abortError) },
      }));

      const outcome = await adapter.send(validCommand, credentials);

      expect(outcome).toEqual({
        status: 'unknown',
        code: 'NETWORK_TIMEOUT',
      });
    });
  });
});
