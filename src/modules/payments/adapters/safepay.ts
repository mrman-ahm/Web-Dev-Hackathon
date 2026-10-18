import { z } from 'zod';
import crypto from 'node:crypto';
import {
  AdapterVerificationError,
  CheckoutMetadataSchema,
  type CheckoutCommand,
  type CheckoutMetadata,
  type CheckoutSession,
  type ProviderOutcome,
} from '../../../contracts/integrations';
import { type Money, MoneySchema } from '../../../contracts/common';

export const SafepayCredentialsSchema = z.strictObject({
  apiKey: z.string().min(1),
  v1Secret: z.string().min(1),
  webhookSecret: z.string().min(1),
  mode: z.literal('sandbox'),
});
export type SafepayCredentials = z.infer<typeof SafepayCredentialsSchema>;

export interface SafepayRawWebhook {
  rawBody: Uint8Array;
  headers: Headers;
  canonicalUrl: string;
}

const safepayIdentity = {
  provider: z.literal('safepay'),
  providerEventId: z.string().min(1).max(500),
  occurredAt: z.string().min(1),
  livemode: z.literal(false),
};

export const SafepayPaymentEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('checkout.completed'),
    providerSessionRef: z.string().min(1),
    providerPaymentRef: z.string().min(1).nullable(),
    paymentStatus: z.enum(['paid', 'unpaid', 'no_payment_required']),
    money: MoneySchema,
    metadata: CheckoutMetadataSchema.nullable(),
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('checkout.expired'),
    providerSessionRef: z.string().min(1),
    metadata: CheckoutMetadataSchema.nullable(),
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('payment.succeeded'),
    providerPaymentRef: z.string().min(1),
    money: MoneySchema,
    metadata: CheckoutMetadataSchema.nullable(),
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('payment.failed'),
    providerPaymentRef: z.string().min(1),
    errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
    metadata: CheckoutMetadataSchema.nullable(),
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('refund.confirmed'),
    providerPaymentRef: z.string().min(1),
    providerRefundRef: z.string().min(1),
    money: MoneySchema,
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('ignored'),
    providerEventType: z.string().min(1).max(100),
  }),
]);
export type SafepayPaymentEvent = z.infer<typeof SafepayPaymentEventSchema>;

export interface RefundCommand {
  tracker: string;
  money: Money;
  reason?: string;
  idempotencyKey?: string;
}

export interface RefundResult {
  providerRefundRef: string;
  tracker: string;
  status: 'succeeded' | 'pending';
  money: Money;
  reason?: string;
}

export interface ReconciledPayment {
  tracker: string;
  state: 'paid' | 'unpaid' | 'failed' | 'refunded' | 'partially_refunded' | 'unknown';
  money: Money;
  amountRefundedMinor?: string;
  providerPaymentRef?: string | null;
  metadata?: CheckoutMetadata | null;
  rawStatus?: string;
}

export interface ISafepayAdapter {
  verifyWebhook(input: SafepayRawWebhook, credentials: SafepayCredentials): SafepayPaymentEvent;
  createCheckout(
    input: CheckoutCommand,
    credentials: SafepayCredentials,
  ): Promise<ProviderOutcome<CheckoutSession>>;
  refundPayment(
    input: RefundCommand,
    credentials: SafepayCredentials,
  ): Promise<ProviderOutcome<RefundResult>>;
  lookupPayment(
    tracker: string,
    credentials: SafepayCredentials,
  ): Promise<ProviderOutcome<ReconciledPayment>>;
  getPassportToken(credentials: SafepayCredentials): Promise<string | null>;
}

function sanitizeErrorCode(code: unknown): string {
  if (typeof code === 'number' && Number.isFinite(code)) {
    return `HTTP_${code}`;
  }
  if (typeof code !== 'string' || !code) return 'PAYMENT_FAILED';
  const clean = code.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(clean) ? clean : 'PAYMENT_FAILED';
}

function extractMetadata(raw: unknown): CheckoutMetadata | null {
  const parsed = CheckoutMetadataSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  // Check if raw contains order_id formatted as UUID
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const orderId = typeof obj.order_id === 'string' ? obj.order_id : null;
    const paymentReqId = typeof obj.paymentRequestId === 'string' ? obj.paymentRequestId : null;
    const candidateId = paymentReqId || orderId;
    if (candidateId && z.uuid().safeParse(candidateId).success) {
      const contactId = typeof obj.contactId === 'string' && z.uuid().safeParse(obj.contactId).success ? obj.contactId : null;
      const opportunityId = typeof obj.opportunityId === 'string' && z.uuid().safeParse(obj.opportunityId).success ? obj.opportunityId : null;
      if (contactId && opportunityId) {
        return {
          paymentRequestId: candidateId,
          contactId,
          opportunityId,
        };
      }
    }
  }
  // Return null rather than fabricating fake zero-UUIDs
  return null;
}

function extractAmountMinor(rawAmount: unknown): string {
  if (typeof rawAmount === 'string' && /^(0|[1-9]\d*)$/.test(rawAmount.trim())) {
    return rawAmount.trim();
  }
  if (typeof rawAmount === 'number' && Number.isSafeInteger(rawAmount) && rawAmount >= 0) {
    return rawAmount.toString();
  }
  // Never convert missing or malformed amount data to zero
  throw new AdapterVerificationError('INVALID_PAYLOAD');
}

/** Safepay /order/v1/init API does not return a provider-derived session expiration timestamp.
 * Application-owned checkout expiration policy: payment sessions expire after 1 hour (3600 seconds). */
export const SAFEPAY_APPLICATION_CHECKOUT_EXPIRY_SECONDS = 3600;

function computeApplicationCheckoutExpiry(): string {
  return new Date(Date.now() + SAFEPAY_APPLICATION_CHECKOUT_EXPIRY_SECONDS * 1000).toISOString();
}

function extractProviderTimestamp(raw: unknown, fallbackObject?: Record<string, unknown>): string {
  const candidates = [
    raw,
    fallbackObject?.charged_at,
    fallbackObject?.refunded_at,
    fallbackObject?.failed_at,
    fallbackObject?.created_at,
  ];

  for (const c of candidates) {
    if (typeof c === 'object' && c !== null && 'seconds' in c) {
      const secs = (c as { seconds: number }).seconds;
      if (typeof secs === 'number' && Number.isFinite(secs)) {
        return new Date(secs * 1000).toISOString();
      }
    }
    if (typeof c === 'string' && c.length > 0) {
      const d = new Date(c);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
    if (typeof c === 'number' && Number.isFinite(c)) {
      return new Date(c > 1e11 ? c : c * 1000).toISOString();
    }
  }

  throw new AdapterVerificationError('INVALID_PAYLOAD');
}

export class SafepayAdapter implements ISafepayAdapter {
  private readonly baseUrl: string;

  constructor(options?: { baseUrl?: string }) {
    this.baseUrl = options?.baseUrl || 'https://sandbox.api.getsafepay.com';
  }

  verifyWebhook(input: SafepayRawWebhook, credentials: SafepayCredentials): SafepayPaymentEvent {
    // 1. Signature extraction
    const rawSignature = input.headers.get('x-sfpy-signature');
    if (!rawSignature) {
      throw new AdapterVerificationError('INVALID_SIGNATURE');
    }

    const cleanHeader = rawSignature.toLowerCase().trim();
    const normalizedSig = cleanHeader.startsWith('sha512=')
      ? cleanHeader.slice(7)
      : cleanHeader;

    // 2. Strict HMAC-SHA512 calculation per official merchant webhook documentation
    const expectedSha512 = crypto
      .createHmac('sha512', credentials.webhookSecret)
      .update(input.rawBody)
      .digest('hex');

    const receivedBuf = Buffer.from(normalizedSig, 'utf8');
    const expected512Buf = Buffer.from(expectedSha512, 'utf8');

    if (
      expected512Buf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expected512Buf, receivedBuf)
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

    const eventType =
      typeof payload.type === 'string'
        ? payload.type
        : typeof payload.event === 'string'
        ? payload.event
        : null;

    if (!eventType) {
      throw new AdapterVerificationError('INVALID_PAYLOAD');
    }

    // Stable provider event ID
    const eventToken =
      typeof payload.token === 'string' && payload.token.length > 0
        ? payload.token
        : typeof payload.id === 'string' && payload.id.length > 0
        ? payload.id
        : null;

    if (!eventToken) {
      throw new AdapterVerificationError('INVALID_PAYLOAD');
    }

    const dataObj = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<
      string,
      unknown
    >;

    // Extract genuine provider timestamp
    const occurredAt = extractProviderTimestamp(payload.created_at, dataObj);

    if (eventType === 'payment.succeeded') {
      const providerPaymentRef =
        typeof dataObj.tracker === 'string' && dataObj.tracker.length > 0
          ? dataObj.tracker
          : typeof dataObj.token === 'string' && dataObj.token.length > 0
          ? dataObj.token
          : eventToken;

      const currency = typeof dataObj.currency === 'string' ? dataObj.currency.toUpperCase() : 'PKR';
      const amountMinor = extractAmountMinor(dataObj.amount);
      const metadata = extractMetadata(dataObj.metadata || payload.metadata);

      return SafepayPaymentEventSchema.parse({
        provider: 'safepay',
        kind: 'payment.succeeded',
        providerEventId: eventToken,
        occurredAt,
        livemode: false,
        providerPaymentRef,
        money: {
          amountMinor,
          currency,
        },
        metadata,
      });
    }

    if (eventType === 'payment.failed') {
      const providerPaymentRef =
        typeof dataObj.tracker === 'string' && dataObj.tracker.length > 0
          ? dataObj.tracker
          : typeof dataObj.token === 'string' && dataObj.token.length > 0
          ? dataObj.token
          : eventToken;

      const rawCode =
        dataObj.category || dataObj.code || dataObj.error_code || dataObj.error || dataObj.message;
      const errorCode = sanitizeErrorCode(rawCode);
      const metadata = extractMetadata(dataObj.metadata || payload.metadata);

      return SafepayPaymentEventSchema.parse({
        provider: 'safepay',
        kind: 'payment.failed',
        providerEventId: eventToken,
        occurredAt,
        livemode: false,
        providerPaymentRef,
        errorCode,
        metadata,
      });
    }

    // Documented merchant event: payment.refunded (or refund.completed)
    if (eventType === 'payment.refunded' || eventType === 'refund.completed') {
      const providerPaymentRef =
        typeof dataObj.tracker === 'string' && dataObj.tracker.length > 0
          ? dataObj.tracker
          : typeof dataObj.token === 'string' && dataObj.token.length > 0
          ? dataObj.token
          : eventToken;

      // Stable provider refund reference from refund_token or eventToken
      const providerRefundRef =
        typeof dataObj.refund_token === 'string' && dataObj.refund_token.length > 0
          ? dataObj.refund_token
          : typeof dataObj.refundToken === 'string' && dataObj.refundToken.length > 0
          ? dataObj.refundToken
          : `${eventToken}`;

      const currency = typeof dataObj.currency === 'string' ? dataObj.currency.toUpperCase() : 'PKR';
      // Use documented data.refund_amount if available, fallback to data.amount
      const rawRefundAmount = dataObj.refund_amount !== undefined ? dataObj.refund_amount : dataObj.amount;
      const amountMinor = extractAmountMinor(rawRefundAmount);

      return SafepayPaymentEventSchema.parse({
        provider: 'safepay',
        kind: 'refund.confirmed',
        providerEventId: eventToken,
        occurredAt,
        livemode: false,
        providerPaymentRef,
        providerRefundRef,
        money: {
          amountMinor,
          currency,
        },
      });
    }

    // Never treat a refund request as a confirmed refund
    if (eventType === 'refund.created' || eventType === 'refund.requested') {
      return SafepayPaymentEventSchema.parse({
        provider: 'safepay',
        kind: 'ignored',
        providerEventId: eventToken,
        occurredAt,
        livemode: false,
        providerEventType: eventType.slice(0, 100),
      });
    }

    if (eventType === 'checkout.completed') {
      const providerSessionRef =
        typeof dataObj.tracker === 'string' && dataObj.tracker.length > 0
          ? dataObj.tracker
          : typeof dataObj.token === 'string' && dataObj.token.length > 0
          ? dataObj.token
          : eventToken;

      const providerPaymentRef =
        typeof dataObj.token === 'string' ? dataObj.token : null;

      const paymentStatus =
        dataObj.payment_status === 'paid' || dataObj.status === 'PAID' ? 'paid' : 'unpaid';

      const currency = typeof dataObj.currency === 'string' ? dataObj.currency.toUpperCase() : 'PKR';
      const amountMinor = extractAmountMinor(dataObj.amount);
      const metadata = extractMetadata(dataObj.metadata || payload.metadata);

      return SafepayPaymentEventSchema.parse({
        provider: 'safepay',
        kind: 'checkout.completed',
        providerEventId: eventToken,
        occurredAt,
        livemode: false,
        providerSessionRef,
        providerPaymentRef,
        paymentStatus,
        money: {
          amountMinor,
          currency,
        },
        metadata,
      });
    }

    return SafepayPaymentEventSchema.parse({
      provider: 'safepay',
      kind: 'ignored',
      providerEventId: eventToken,
      occurredAt,
      livemode: false,
      providerEventType: eventType.slice(0, 100),
    });
  }

  async createCheckout(
    input: CheckoutCommand,
    credentials: SafepayCredentials,
  ): Promise<ProviderOutcome<CheckoutSession>> {
    const v3Url = `${this.baseUrl}/order/payments/v3/`;
    const v3Payload = {
      merchant_api_key: credentials.apiKey,
      intent: 'CYBERSOURCE',
      mode: 'payment',
      entry_mode: 'raw',
      currency: input.money.currency,
      amount: Number(input.money.amountMinor),
      metadata: input.metadata,
    };

    let response: Response;
    let usedEndpoint = 'v3';
    try {
      response = await fetch(v3Url, {
        method: 'POST',
        headers: {
          'x-sfpy-merchant-secret': credentials.v1Secret,
          'content-type': 'application/json',
        },
        body: JSON.stringify(v3Payload),
        signal: AbortSignal.timeout(10000),
      });

      // If v3 endpoint returns 404 (legacy environment), fall back to /order/v1/init
      if (response.status === 404) {
        usedEndpoint = 'v1';
        const v1Url = `${this.baseUrl}/order/v1/init`;
        const v1Payload = {
          client: credentials.apiKey,
          amount: Number(input.money.amountMinor),
          currency: input.money.currency,
          environment: 'sandbox',
          metadata: input.metadata,
        };
        response = await fetch(v1Url, {
          method: 'POST',
          headers: {
            'x-sfpy-merchant-secret': credentials.v1Secret,
            'content-type': 'application/json',
          },
          body: JSON.stringify(v1Payload),
          signal: AbortSignal.timeout(10000),
        });
      }
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message.includes('aborted'));
      if (isAbort) {
        return {
          status: 'unknown',
          code: 'NETWORK_TIMEOUT',
          reconciliationReference: input.paymentRequestId,
        };
      }
      return {
        status: 'unknown',
        code: 'NETWORK_ERROR',
        reconciliationReference: input.paymentRequestId,
      };
    }

    if (response.ok) {
      try {
        const data = (await response.json()) as Record<string, unknown>;
        const innerData = data?.data as Record<string, unknown> | undefined;
        const token =
          (typeof innerData?.token === 'string' && innerData.token.length > 0 && innerData.token) ||
          (typeof data?.token === 'string' && data.token.length > 0 && data.token) ||
          null;

        if (!token) {
          return {
            status: 'unknown',
            code: 'MISSING_PROVIDER_REFERENCE',
            reconciliationReference: input.paymentRequestId,
          };
        }

        const checkoutUrl = `${this.baseUrl}/checkout/pay?beacon=${token}&order_id=${encodeURIComponent(input.metadata.paymentRequestId)}`;
        const expiresAt = computeApplicationCheckoutExpiry();

        return {
          status: 'confirmed',
          value: {
            providerSessionRef: token,
            checkoutUrl,
            expiresAt,
          },
          reference: token,
        };
      } catch {
        return {
          status: 'unknown',
          code: 'INVALID_PROVIDER_RESPONSE',
          reconciliationReference: input.paymentRequestId,
        };
      }
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

    if (response.status >= 400 && response.status < 500) {
      return {
        status: 'permanent_failure',
        code: 'INVALID_REQUEST',
      };
    }

    return {
      status: 'temporary_failure',
      code: 'GATEWAY_ERROR',
      retryAfterSeconds: 60,
    };
  }

  async refundPayment(
    input: RefundCommand,
    credentials: SafepayCredentials,
  ): Promise<ProviderOutcome<RefundResult>> {
    if (!input.tracker || typeof input.tracker !== 'string' || input.tracker.trim().length === 0) {
      return {
        status: 'permanent_failure',
        code: 'INVALID_TRACKER',
      };
    }

    if (BigInt(input.money.amountMinor) <= 0n) {
      return {
        status: 'permanent_failure',
        code: 'INVALID_AMOUNT',
      };
    }

    const cleanTracker = input.tracker.trim();
    const url = `${this.baseUrl}/order/payments/v3/${encodeURIComponent(cleanTracker)}/refund`;
    const payload = {
      currency: input.money.currency,
      amount: Number(input.money.amountMinor),
      reason: input.reason || 'Customer refund',
    };

    const headers: Record<string, string> = {
      'x-sfpy-merchant-secret': credentials.v1Secret,
      'content-type': 'application/json',
    };
    if (input.idempotencyKey) {
      headers['idempotency-key'] = input.idempotencyKey;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
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
          reconciliationReference: cleanTracker,
        };
      }
      return {
        status: 'unknown',
        code: 'NETWORK_ERROR',
        reconciliationReference: cleanTracker,
      };
    }

    if (response.ok) {
      try {
        const data = (await response.json()) as Record<string, unknown>;
        const innerData = (data?.data && typeof data.data === 'object' ? data.data : data) as Record<string, unknown>;

        const refundRef =
          (typeof innerData?.token === 'string' && innerData.token.length > 0 && innerData.token) ||
          (typeof innerData?.id === 'string' && innerData.id.length > 0 && innerData.id) ||
          (typeof innerData?.refund_token === 'string' && innerData.refund_token.length > 0 && innerData.refund_token) ||
          null;

        if (!refundRef) {
          return {
            status: 'unknown',
            code: 'MISSING_PROVIDER_REFERENCE',
            reconciliationReference: cleanTracker,
          };
        }

        const stateRaw = String(innerData?.state || innerData?.status || 'succeeded').toLowerCase();
        // Never treat a pending/requested refund as a confirmed refund
        if (stateRaw === 'pending' || stateRaw === 'processing' || stateRaw === 'requested') {
          return {
            status: 'unknown',
            code: 'REFUND_PENDING_CONFIRMATION',
            reconciliationReference: refundRef,
          };
        }

        return {
          status: 'confirmed',
          value: {
            providerRefundRef: refundRef,
            tracker: cleanTracker,
            status: 'succeeded',
            money: input.money,
            reason: input.reason,
          },
          reference: refundRef,
        };
      } catch {
        return {
          status: 'unknown',
          code: 'INVALID_PROVIDER_RESPONSE',
          reconciliationReference: cleanTracker,
        };
      }
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

    let errorCode = 'REFUND_FAILED';
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      const rawCode = errBody?.error || errBody?.code || (errBody?.status as Record<string, unknown>)?.message;
      errorCode = sanitizeErrorCode(rawCode);
    } catch {
      // ignore
    }

    return {
      status: 'permanent_failure',
      code: errorCode,
    };
  }

  async lookupPayment(
    tracker: string,
    credentials: SafepayCredentials,
  ): Promise<ProviderOutcome<ReconciledPayment>> {
    if (!tracker || typeof tracker !== 'string' || tracker.trim().length === 0) {
      return {
        status: 'permanent_failure',
        code: 'INVALID_TRACKER',
      };
    }

    const cleanTracker = tracker.trim();
    const url = `${this.baseUrl}/reporter/api/v1/payments/${encodeURIComponent(cleanTracker)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-sfpy-merchant-secret': credentials.v1Secret,
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
          reconciliationReference: cleanTracker,
        };
      }
      return {
        status: 'unknown',
        code: 'NETWORK_ERROR',
        reconciliationReference: cleanTracker,
      };
    }

    if (response.ok) {
      try {
        const body = (await response.json()) as Record<string, unknown>;
        const data = (body?.data && typeof body.data === 'object' ? body.data : body) as Record<string, unknown>;

        const rawState = String(data?.state || data?.status || '').toLowerCase();
        let state: ReconciledPayment['state'] = 'unknown';
        if (rawState === 'paid' || rawState === 'captured' || rawState === 'completed' || rawState === 'success') {
          state = 'paid';
        } else if (rawState === 'unpaid' || rawState === 'pending' || rawState === 'created') {
          state = 'unpaid';
        } else if (rawState === 'refunded') {
          state = 'refunded';
        } else if (rawState === 'partially_refunded') {
          state = 'partially_refunded';
        } else if (rawState === 'failed' || rawState === 'cancelled' || rawState === 'expired') {
          state = 'failed';
        }

        const amountMinor = extractAmountMinor(data.net || data.amount || data.total);
        const currency =
          typeof data.currency === 'string' && data.currency.length === 3 ? data.currency.toUpperCase() : 'PKR';
        const metadata = extractMetadata(data.metadata);

        let amountRefundedMinor: string | undefined;
        if (data.refund_amount !== undefined && data.refund_amount !== null) {
          amountRefundedMinor = extractAmountMinor(data.refund_amount);
        }

        const providerPaymentRef =
          (typeof data.token === 'string' && data.token.length > 0 && data.token) ||
          (typeof data.payment_token === 'string' && data.payment_token.length > 0 && data.payment_token) ||
          null;

        return {
          status: 'confirmed',
          value: {
            tracker: cleanTracker,
            state,
            money: {
              amountMinor,
              currency,
            },
            amountRefundedMinor,
            providerPaymentRef,
            metadata,
            rawStatus: rawState,
          },
          reference: cleanTracker,
        };
      } catch {
        return {
          status: 'unknown',
          code: 'INVALID_PROVIDER_RESPONSE',
          reconciliationReference: cleanTracker,
        };
      }
    }

    if (response.status === 404) {
      return {
        status: 'permanent_failure',
        code: 'PAYMENT_NOT_FOUND',
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

  async getPassportToken(credentials: SafepayCredentials): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/client/passport/v1/token`, {
        method: 'POST',
        headers: {
          'x-sfpy-merchant-secret': credentials.v1Secret,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Record<string, unknown>;
      const inner = data?.data as Record<string, unknown> | undefined;
      return typeof inner?.token === 'string' ? inner.token : null;
    } catch {
      return null;
    }
  }
}
