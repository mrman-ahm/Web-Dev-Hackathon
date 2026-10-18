import { z } from 'zod';
import crypto from 'node:crypto';
import {
  AdapterVerificationError,
  type ProviderOutcome,
  type SendMessageCommand,
  type SentMessage,
} from '../../../contracts/integrations';
import { PhoneE164Schema } from '../../../contracts/common';

export const TextbeeCredentialsSchema = z.strictObject({
  apiKey: z.string().min(1),
  deviceId: z.string().min(1),
  webhookSecret: z.string().min(1),
  gatewayNumber: PhoneE164Schema,
});
export type TextbeeCredentials = z.infer<typeof TextbeeCredentialsSchema>;

export interface TextbeeRawWebhook {
  rawBody: Uint8Array;
  headers: Headers;
  canonicalUrl: string;
}

const textbeeIdentity = {
  provider: z.literal('textbee'),
  providerEventId: z.string().min(1).max(500),
  providerMessageRef: z.string().min(1).max(500),
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
    occurredAt: z.string().optional(),
  }),
  z.strictObject({
    ...textbeeIdentity,
    kind: z.literal('message.status'),
    state: z.enum(['pending', 'sent', 'delivered', 'failed', 'unknown']),
    errorCode: z.string().max(100).nullable(),
    occurredAt: z.string().optional(),
  }),
]);
export type TextbeeMessageEvent = z.infer<typeof TextbeeMessageEventSchema>;

export interface ITextbeeAdapter {
  verifyInbound(input: TextbeeRawWebhook, credentials: TextbeeCredentials): TextbeeMessageEvent;
  send(input: SendMessageCommand, credentials: TextbeeCredentials): Promise<ProviderOutcome<SentMessage>>;
}

const STOP_KEYWORDS = new Set(['STOP', 'CANCEL', 'UNSUBSCRIBE', 'QUIT', 'END']);
const START_KEYWORDS = new Set(['START', 'UNSTOP']);
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

function detectOptOut(body: string): 'none' | 'stop' | 'start' | 'help' {
  const normalized = body.trim().toUpperCase();
  if (STOP_KEYWORDS.has(normalized)) return 'stop';
  if (START_KEYWORDS.has(normalized)) return 'start';
  if (HELP_KEYWORDS.has(normalized)) return 'help';
  return 'none';
}

function sanitizeCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const sanitized = code.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
  return sanitized.length > 0 ? sanitized : null;
}

export class TextbeeAdapter implements ITextbeeAdapter {
  private readonly baseUrl: string;

  constructor(options?: { baseUrl?: string }) {
    this.baseUrl = options?.baseUrl || 'https://api.textbee.dev/api/v1/gateway';
  }

  verifyInbound(input: TextbeeRawWebhook, credentials: TextbeeCredentials): TextbeeMessageEvent {
    // 1. Signature extraction
    const rawSignature = input.headers.get('x-signature');
    if (!rawSignature) {
      throw new AdapterVerificationError('INVALID_SIGNATURE');
    }

    // 2. HMAC-SHA256 calculation
    const expectedSignature = crypto
      .createHmac('sha256', credentials.webhookSecret)
      .update(input.rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const receivedBuf = Buffer.from(rawSignature.toLowerCase().trim(), 'utf8');

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new AdapterVerificationError('INVALID_SIGNATURE');
    }

    // 3. Payload parsing
    let payload: Record<string, unknown>;
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(input.rawBody);
      payload = JSON.parse(decoded);
    } catch {
      throw new AdapterVerificationError('INVALID_PAYLOAD');
    }

    if (!payload || typeof payload !== 'object') {
      throw new AdapterVerificationError('INVALID_PAYLOAD');
    }

    // 4. Validate device identity
    const deviceId = payload.deviceId;
    if (typeof deviceId !== 'string' || deviceId !== credentials.deviceId) {
      throw new AdapterVerificationError('CONNECTION_MISMATCH');
    }

    const webhookEvent = payload.webhookEvent;
    if (typeof webhookEvent !== 'string') {
      throw new AdapterVerificationError('INVALID_PAYLOAD');
    }

    const idempotencyKey =
      typeof payload.idempotencyKey === 'string' && payload.idempotencyKey.length > 0
        ? payload.idempotencyKey
        : null;

    if (webhookEvent === 'MESSAGE_RECEIVED') {
      const smsId = typeof payload.smsId === 'string' ? payload.smsId : null;
      const message = typeof payload.message === 'string' ? payload.message : '';
      const sender = typeof payload.sender === 'string' ? payload.sender : null;

      if (!smsId || !sender) {
        throw new AdapterVerificationError('INVALID_PAYLOAD');
      }

      const optOut = detectOptOut(message);
      const providerEventId = idempotencyKey || `textbee-inbound-${smsId}`;

      return TextbeeMessageEventSchema.parse({
        provider: 'textbee',
        kind: 'message.received',
        providerEventId,
        providerMessageRef: smsId,
        deviceId: credentials.deviceId,
        channel: 'sms',
        from: sender,
        to: credentials.gatewayNumber,
        body: message,
        optOut,
      });
    }

    if (
      webhookEvent === 'MESSAGE_SENT' ||
      webhookEvent === 'MESSAGE_DELIVERED' ||
      webhookEvent === 'MESSAGE_FAILED' ||
      webhookEvent === 'UNKNOWN_STATE'
    ) {
      const smsId =
        typeof payload.smsId === 'string' && payload.smsId.length > 0
          ? payload.smsId
          : typeof payload.smsBatchId === 'string' && payload.smsBatchId.length > 0
          ? payload.smsBatchId
          : null;
      const recipient = typeof payload.recipient === 'string' ? payload.recipient : null;

      if (!smsId) {
        throw new AdapterVerificationError('INVALID_PAYLOAD');
      }

      let state: 'pending' | 'sent' | 'delivered' | 'failed' | 'unknown';
      let errorCode: string | null = null;

      if (webhookEvent === 'MESSAGE_SENT') {
        state = 'sent';
      } else if (webhookEvent === 'MESSAGE_DELIVERED') {
        state = 'delivered';
      } else if (webhookEvent === 'UNKNOWN_STATE') {
        // Non-terminal unknown status: SMS may still have been delivered per textbee documentation
        state = 'unknown';
        errorCode = null;
      } else {
        state = 'failed';
        const rawErr =
          typeof payload.errorCode === 'string'
            ? payload.errorCode
            : typeof payload.errorMessage === 'string'
            ? payload.errorMessage
            : 'MESSAGE_FAILED';
        errorCode = sanitizeCode(rawErr) || 'MESSAGE_FAILED';
      }

      const occurredAt =
        typeof payload.updatedAt === 'string'
          ? payload.updatedAt
          : typeof payload.timestamp === 'string'
          ? payload.timestamp
          : typeof payload.sentAt === 'string'
          ? payload.sentAt
          : typeof payload.deliveredAt === 'string'
          ? payload.deliveredAt
          : typeof payload.failedAt === 'string'
          ? payload.failedAt
          : undefined;

      const eventSuffix = webhookEvent === 'UNKNOWN_STATE' ? 'unknown' : state;
      const providerEventId = idempotencyKey || `textbee-${eventSuffix}-${smsId}`;

      return TextbeeMessageEventSchema.parse({
        provider: 'textbee',
        kind: 'message.status',
        providerEventId,
        providerMessageRef: smsId,
        deviceId: credentials.deviceId,
        channel: 'sms',
        from: credentials.gatewayNumber,
        to: recipient || credentials.gatewayNumber,
        state,
        errorCode,
        ...(occurredAt ? { occurredAt } : {}),
      });
    }

    throw new AdapterVerificationError('INVALID_PAYLOAD');
  }

  async send(
    input: SendMessageCommand,
    credentials: TextbeeCredentials,
  ): Promise<ProviderOutcome<SentMessage>> {
    const url = `${this.baseUrl}/send-sms`;
    const payload = {
      recipients: [input.to],
      message: input.body,
      deviceId: credentials.deviceId,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': credentials.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message.includes('aborted'));
      if (isAbort) {
        return {
          status: 'unknown',
          code: 'NETWORK_TIMEOUT',
          reconciliationReference: input.deliveryId,
        };
      }
      return {
        status: 'unknown',
        code: 'NETWORK_ERROR',
        reconciliationReference: input.deliveryId,
      };
    }

    if (response.ok) {
      try {
        const data = (await response.json()) as Record<string, unknown>;
        const innerData = data?.data as Record<string, unknown> | undefined;
        const ref =
          (typeof innerData?.smsBatchId === 'string' && innerData.smsBatchId.length > 0 && innerData.smsBatchId) ||
          (typeof innerData?.id === 'string' && innerData.id.length > 0 && innerData.id) ||
          (typeof data?.smsBatchId === 'string' && data.smsBatchId.length > 0 && data.smsBatchId) ||
          (typeof data?.id === 'string' && data.id.length > 0 && data.id) ||
          null;

        if (!ref) {
          return {
            status: 'unknown',
            code: 'MISSING_PROVIDER_REFERENCE',
            reconciliationReference: input.deliveryId,
          };
        }

        // Truthful submission state: API acceptance means queued/pending on device, not carrier-sent
        const state: 'pending' | 'sent' =
          (typeof innerData?.status === 'string' && innerData.status.toLowerCase() === 'sent') ||
          (typeof data?.status === 'string' && data.status.toLowerCase() === 'sent')
            ? 'sent'
            : 'pending';

        return {
          status: 'confirmed',
          value: {
            providerMessageRef: ref,
            state,
            channel: 'sms',
          },
          reference: ref,
        };
      } catch {
        return {
          status: 'unknown',
          code: 'INVALID_PROVIDER_RESPONSE',
          reconciliationReference: input.deliveryId,
        };
      }
    }

    // Handle HTTP error statuses
    if (response.status === 429) {
      const retryHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryHeader ? Math.min(Math.max(parseInt(retryHeader, 10) || 60, 1), 86400) : 60;
      return {
        status: 'temporary_failure',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds,
      };
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      return {
        status: 'temporary_failure',
        code: 'SERVICE_UNAVAILABLE',
        retryAfterSeconds: 30,
      };
    }

    let errorMessage = '';
    try {
      const errJson = (await response.json()) as Record<string, unknown>;
      errorMessage = typeof errJson?.message === 'string' ? errJson.message.toLowerCase() : '';
    } catch {
      // ignore
    }

    if (errorMessage.includes('offline') || errorMessage.includes('disconnected')) {
      return {
        status: 'temporary_failure',
        code: 'DEVICE_OFFLINE',
        retryAfterSeconds: 60,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: 'permanent_failure',
        code: 'AUTHENTICATION_FAILED',
      };
    }

    if (
      response.status === 400 &&
      (errorMessage.includes('recipient') ||
        errorMessage.includes('phone') ||
        errorMessage.includes('number') ||
        errorMessage.includes('formatting'))
    ) {
      return {
        status: 'permanent_failure',
        code: 'INVALID_RECIPIENT',
      };
    }

    if (response.status >= 400 && response.status < 500) {
      return {
        status: 'permanent_failure',
        code: 'INVALID_REQUEST',
      };
    }

    return {
      status: 'temporary_failure',
      code: 'PROVIDER_ERROR',
      retryAfterSeconds: 60,
    };
  }
}
