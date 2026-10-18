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

export type TextbeeDeliveryState = 'pending' | 'dispatched' | 'sent' | 'delivered' | 'failed' | 'unknown';

export interface TextbeeBatchRecipientStatus {
  smsId: string;
  recipient: string;
  state: TextbeeDeliveryState;
  errorCode: string | null;
  errorMessage?: string | null;
  requestedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
}

export interface TextbeeBatchStatus {
  smsBatchId: string;
  deviceId: string;
  status: 'pending' | 'processing' | 'completed' | 'partial_success' | 'failed' | 'unknown';
  successCount: number;
  failureCount: number;
  pendingCount?: number;
  deliveredCount?: number;
  messages: TextbeeBatchRecipientStatus[];
  estimatedCompletionAt?: string;
}

export interface TextbeeMessageStatus {
  smsId: string;
  smsBatchId?: string;
  deviceId: string;
  recipient: string;
  state: TextbeeDeliveryState;
  errorCode: string | null;
  errorMessage?: string | null;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
}

export interface TextbeeDeviceStatus {
  deviceId: string;
  isOnline: boolean;
  batteryLevel?: number;
  networkType?: string;
  model?: string;
  lastSeenAt?: string;
}

export function resolveDeliveryTransition(
  current: TextbeeDeliveryState,
  incoming: TextbeeDeliveryState,
): TextbeeDeliveryState {
  // Terminal success state: once confirmed delivered, never regress
  if (current === 'delivered') {
    return 'delivered';
  }

  // Terminal failure: once confirmed failed, do not regress to transient pending/dispatched/unknown
  if (current === 'failed') {
    if (incoming === 'delivered') return 'delivered';
    return 'failed';
  }

  // Incoming terminal delivery always wins over non-terminal
  if (incoming === 'delivered') {
    return 'delivered';
  }

  // Incoming failure wins over pending/dispatched/sent/unknown
  if (incoming === 'failed') {
    return 'failed';
  }

  // If already sent, do not regress to queued/pending/dispatched/unknown
  if (current === 'sent') {
    return 'sent';
  }

  // If dispatched, don't regress to pending
  if (current === 'dispatched') {
    if (incoming === 'sent') return 'sent';
    return 'dispatched';
  }

  // If unknown, accept concrete states
  if (current === 'unknown') {
    if (incoming === 'sent' || incoming === 'dispatched' || incoming === 'pending') {
      return incoming;
    }
    return 'unknown';
  }

  return incoming;
}

export interface ITextbeeAdapter {
  verifyInbound(input: TextbeeRawWebhook, credentials: TextbeeCredentials): TextbeeMessageEvent;
  send(input: SendMessageCommand, credentials: TextbeeCredentials): Promise<ProviderOutcome<SentMessage>>;
  lookupBatch(smsBatchId: string, credentials: TextbeeCredentials): Promise<ProviderOutcome<TextbeeBatchStatus>>;
  lookupMessage(smsId: string, credentials: TextbeeCredentials): Promise<ProviderOutcome<TextbeeMessageStatus>>;
  getDeviceStatus(credentials: TextbeeCredentials): Promise<ProviderOutcome<TextbeeDeviceStatus>>;
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

  async lookupBatch(
    smsBatchId: string,
    credentials: TextbeeCredentials,
  ): Promise<ProviderOutcome<TextbeeBatchStatus>> {
    if (!smsBatchId || typeof smsBatchId !== 'string' || smsBatchId.trim().length === 0) {
      return {
        status: 'permanent_failure',
        code: 'INVALID_BATCH_ID',
      };
    }

    const cleanBatchId = smsBatchId.trim();
    const url = `${this.baseUrl}/devices/${encodeURIComponent(credentials.deviceId)}/sms-batch/${encodeURIComponent(cleanBatchId)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': credentials.apiKey,
          Accept: 'application/json',
        },
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
          reconciliationReference: cleanBatchId,
        };
      }
      return {
        status: 'unknown',
        code: 'NETWORK_ERROR',
        reconciliationReference: cleanBatchId,
      };
    }

    if (response.ok) {
      try {
        const body = (await response.json()) as Record<string, unknown>;
        const data = (body?.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;

        const rawStatus = String(data?.status || 'pending').toLowerCase();
        let status: TextbeeBatchStatus['status'] = 'unknown';
        if (rawStatus === 'completed' || rawStatus === 'finished' || rawStatus === 'success') {
          status = 'completed';
        } else if (rawStatus === 'partial_success' || rawStatus === 'partial') {
          status = 'partial_success';
        } else if (rawStatus === 'processing' || rawStatus === 'in_progress') {
          status = 'processing';
        } else if (rawStatus === 'pending' || rawStatus === 'queued') {
          status = 'pending';
        } else if (rawStatus === 'failed' || rawStatus === 'error') {
          status = 'failed';
        }

        const successCount = typeof data?.successCount === 'number' ? data.successCount : 0;
        const failureCount = typeof data?.failureCount === 'number' ? data.failureCount : 0;
        const pendingCount = typeof data?.pendingCount === 'number' ? data.pendingCount : undefined;
        const deliveredCount = typeof data?.deliveredCount === 'number' ? data.deliveredCount : undefined;
        const estimatedCompletionAt =
          typeof data?.estimatedCompletionAt === 'string' ? data.estimatedCompletionAt : undefined;

        const rawMessages = Array.isArray(data?.messages)
          ? data.messages
          : Array.isArray(data?.recipients)
          ? data.recipients
          : [];
        const messages: TextbeeBatchRecipientStatus[] = rawMessages.map((m: Record<string, unknown>) => {
          const smsId = String(m?._id || m?.id || m?.smsId || '');
          const recipient = String(m?.recipient || m?.to || '');
          const msgStateRaw = String(m?.status || m?.state || 'pending').toLowerCase();
          let state: TextbeeDeliveryState = 'unknown';
          if (msgStateRaw === 'delivered') state = 'delivered';
          else if (msgStateRaw === 'sent') state = 'sent';
          else if (msgStateRaw === 'dispatched') state = 'dispatched';
          else if (msgStateRaw === 'pending' || msgStateRaw === 'queued') state = 'pending';
          else if (msgStateRaw === 'failed' || msgStateRaw === 'error') state = 'failed';
          else if (msgStateRaw === 'unknown' || msgStateRaw === 'unknown_state') state = 'unknown';

          return {
            smsId,
            recipient,
            state,
            errorCode: sanitizeCode(typeof m?.errorCode === 'string' ? m.errorCode : null),
            errorMessage: typeof m?.errorMessage === 'string' ? m.errorMessage : null,
            requestedAt: typeof m?.requestedAt === 'string' ? m.requestedAt : undefined,
            sentAt: typeof m?.sentAt === 'string' ? m.sentAt : undefined,
            deliveredAt: typeof m?.deliveredAt === 'string' ? m.deliveredAt : undefined,
            failedAt: typeof m?.failedAt === 'string' ? m.failedAt : undefined,
          };
        });

        return {
          status: 'confirmed',
          value: {
            smsBatchId: cleanBatchId,
            deviceId: credentials.deviceId,
            status,
            successCount,
            failureCount,
            pendingCount,
            deliveredCount,
            messages,
            estimatedCompletionAt,
          },
          reference: cleanBatchId,
        };
      } catch {
        return {
          status: 'unknown',
          code: 'INVALID_PROVIDER_RESPONSE',
          reconciliationReference: cleanBatchId,
        };
      }
    }

    if (response.status === 404) {
      return {
        status: 'permanent_failure',
        code: 'BATCH_NOT_FOUND',
      };
    }

    if (response.status === 429) {
      const retryHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryHeader ? Math.min(Math.max(parseInt(retryHeader, 10) || 60, 1), 86400) : 30;
      return {
        status: 'temporary_failure',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds,
      };
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      return {
        status: 'temporary_failure',
        code: 'GATEWAY_ERROR',
        retryAfterSeconds: 30,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: 'permanent_failure',
        code: 'AUTHENTICATION_FAILED',
      };
    }

    return {
      status: 'permanent_failure',
      code: 'LOOKUP_FAILED',
    };
  }

  async lookupMessage(
    smsId: string,
    credentials: TextbeeCredentials,
  ): Promise<ProviderOutcome<TextbeeMessageStatus>> {
    if (!smsId || typeof smsId !== 'string' || smsId.trim().length === 0) {
      return {
        status: 'permanent_failure',
        code: 'INVALID_SMS_ID',
      };
    }

    const cleanSmsId = smsId.trim();
    const url = `${this.baseUrl}/messages/${encodeURIComponent(cleanSmsId)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': credentials.apiKey,
          Accept: 'application/json',
        },
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
          reconciliationReference: cleanSmsId,
        };
      }
      return {
        status: 'unknown',
        code: 'NETWORK_ERROR',
        reconciliationReference: cleanSmsId,
      };
    }

    if (response.ok) {
      try {
        const body = (await response.json()) as Record<string, unknown>;
        const data = (body?.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;

        const msgStateRaw = String(data?.status || data?.state || 'pending').toLowerCase();
        let state: TextbeeDeliveryState = 'unknown';
        if (msgStateRaw === 'delivered') state = 'delivered';
        else if (msgStateRaw === 'sent') state = 'sent';
        else if (msgStateRaw === 'dispatched') state = 'dispatched';
        else if (msgStateRaw === 'pending' || msgStateRaw === 'queued') state = 'pending';
        else if (msgStateRaw === 'failed' || msgStateRaw === 'error') state = 'failed';
        else if (msgStateRaw === 'unknown' || msgStateRaw === 'unknown_state') state = 'unknown';

        return {
          status: 'confirmed',
          value: {
            smsId: cleanSmsId,
            smsBatchId:
              typeof data?.smsBatchId === 'string'
                ? data.smsBatchId
                : typeof data?.smsBatch === 'string'
                ? data.smsBatch
                : undefined,
            deviceId: typeof data?.deviceId === 'string' ? data.deviceId : credentials.deviceId,
            recipient: String(data?.recipient || data?.to || ''),
            state,
            errorCode: sanitizeCode(typeof data?.errorCode === 'string' ? data.errorCode : null),
            errorMessage: typeof data?.errorMessage === 'string' ? data.errorMessage : null,
            sentAt: typeof data?.sentAt === 'string' ? data.sentAt : undefined,
            deliveredAt: typeof data?.deliveredAt === 'string' ? data.deliveredAt : undefined,
            failedAt: typeof data?.failedAt === 'string' ? data.failedAt : undefined,
          },
          reference: cleanSmsId,
        };
      } catch {
        return {
          status: 'unknown',
          code: 'INVALID_PROVIDER_RESPONSE',
          reconciliationReference: cleanSmsId,
        };
      }
    }

    if (response.status === 404) {
      return {
        status: 'permanent_failure',
        code: 'MESSAGE_NOT_FOUND',
      };
    }

    if (response.status === 429) {
      const retryHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryHeader ? Math.min(Math.max(parseInt(retryHeader, 10) || 60, 1), 86400) : 30;
      return {
        status: 'temporary_failure',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds,
      };
    }

    if (response.status === 502 || response.status === 503 || response.status === 504) {
      return {
        status: 'temporary_failure',
        code: 'GATEWAY_ERROR',
        retryAfterSeconds: 30,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: 'permanent_failure',
        code: 'AUTHENTICATION_FAILED',
      };
    }

    return {
      status: 'permanent_failure',
      code: 'LOOKUP_FAILED',
    };
  }

  async getDeviceStatus(
    credentials: TextbeeCredentials,
  ): Promise<ProviderOutcome<TextbeeDeviceStatus>> {
    const url = `${this.baseUrl}/devices/${encodeURIComponent(credentials.deviceId)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-api-key': credentials.apiKey,
          Accept: 'application/json',
        },
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
          reconciliationReference: credentials.deviceId,
        };
      }
      return {
        status: 'unknown',
        code: 'NETWORK_ERROR',
        reconciliationReference: credentials.deviceId,
      };
    }

    if (response.ok) {
      try {
        const body = (await response.json()) as Record<string, unknown>;
        const data = (body?.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;

        const isOnline =
          data?.isOnline === true ||
          data?.online === true ||
          String(data?.status).toLowerCase() === 'online';

        return {
          status: 'confirmed',
          value: {
            deviceId: credentials.deviceId,
            isOnline,
            batteryLevel:
              typeof data?.batteryLevel === 'number'
                ? data.batteryLevel
                : typeof data?.battery === 'number'
                ? data.battery
                : undefined,
            networkType: typeof data?.networkType === 'string' ? data.networkType : undefined,
            model: typeof data?.model === 'string' ? data.model : typeof data?.brand === 'string' ? data.brand : undefined,
            lastSeenAt:
              typeof data?.lastSeenAt === 'string'
                ? data.lastSeenAt
                : typeof data?.updatedAt === 'string'
                ? data.updatedAt
                : undefined,
          },
          reference: credentials.deviceId,
        };
      } catch {
        return {
          status: 'unknown',
          code: 'INVALID_PROVIDER_RESPONSE',
          reconciliationReference: credentials.deviceId,
        };
      }
    }

    if (response.status === 404) {
      return {
        status: 'permanent_failure',
        code: 'DEVICE_NOT_FOUND',
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: 'permanent_failure',
        code: 'AUTHENTICATION_FAILED',
      };
    }

    return {
      status: 'temporary_failure',
      code: 'GATEWAY_ERROR',
      retryAfterSeconds: 30,
    };
  }
}
