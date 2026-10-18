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
import { MoneySchema } from '../../../contracts/common';

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
    metadata: CheckoutMetadataSchema,
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('checkout.expired'),
    providerSessionRef: z.string().min(1),
    metadata: CheckoutMetadataSchema,
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('payment.succeeded'),
    providerPaymentRef: z.string().min(1),
    money: MoneySchema,
    metadata: CheckoutMetadataSchema,
  }),
  z.strictObject({
    ...safepayIdentity,
    kind: z.literal('payment.failed'),
    providerPaymentRef: z.string().min(1),
    errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
    metadata: CheckoutMetadataSchema,
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

export interface ISafepayAdapter {
  verifyWebhook(input: SafepayRawWebhook, credentials: SafepayCredentials): SafepayPaymentEvent;
  createCheckout(
    input: CheckoutCommand,
    credentials: SafepayCredentials,
  ): Promise<ProviderOutcome<CheckoutSession>>;
}

function sanitizeErrorCode(code: unknown): string {
  if (typeof code !== 'string' || !code) return 'PAYMENT_FAILED';
  const clean = code.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(clean) ? clean : 'PAYMENT_FAILED';
}

function extractMetadata(raw: unknown): CheckoutMetadata {
  const parsed = CheckoutMetadataSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    paymentRequestId: '00000000-0000-0000-0000-000000000000',
    contactId: '00000000-0000-0000-0000-000000000000',
    opportunityId: '00000000-0000-0000-0000-000000000000',
  };
}

function extractAmountMinor(rawAmount: unknown): string {
  if (typeof rawAmount === 'string' && /^\d+$/.test(rawAmount)) {
    return rawAmount;
  }
  if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) {
    return Math.round(rawAmount).toString();
  }
  return '0';
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

    // 2. HMAC-SHA512 calculation
    const expectedSignature = crypto
      .createHmac('sha512', credentials.webhookSecret)
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

    const eventType =
      typeof payload.type === 'string'
        ? payload.type
        : typeof payload.event === 'string'
        ? payload.event
        : null;

    if (!eventType) {
      throw new AdapterVerificationError('INVALID_PAYLOAD');
    }

    const eventToken =
      typeof payload.token === 'string'
        ? payload.token
        : typeof payload.id === 'string'
        ? payload.id
        : `evt_${Date.now()}`;

    const occurredAt = new Date().toISOString();
    const dataObj = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<
      string,
      unknown
    >;

    if (eventType === 'payment.succeeded' || eventType === 'payment.completed') {
      const providerPaymentRef =
        typeof dataObj.token === 'string'
          ? dataObj.token
          : typeof dataObj.tracker === 'string'
          ? dataObj.tracker
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
        typeof dataObj.token === 'string'
          ? dataObj.token
          : typeof dataObj.tracker === 'string'
          ? dataObj.tracker
          : eventToken;

      const errorCode = sanitizeErrorCode(dataObj.error_code || dataObj.error || dataObj.message);
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

    if (eventType === 'refund.completed' || eventType === 'refund.created') {
      const providerPaymentRef =
        typeof dataObj.token === 'string'
          ? dataObj.token
          : typeof dataObj.tracker === 'string'
          ? dataObj.tracker
          : eventToken;

      const providerRefundRef =
        typeof dataObj.refund_token === 'string'
          ? dataObj.refund_token
          : typeof dataObj.refundToken === 'string'
          ? dataObj.refundToken
          : `ref_${Date.now()}`;

      const currency = typeof dataObj.currency === 'string' ? dataObj.currency.toUpperCase() : 'PKR';
      const amountMinor = extractAmountMinor(dataObj.amount);

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

    if (eventType === 'checkout.completed') {
      const providerSessionRef =
        typeof dataObj.tracker === 'string'
          ? dataObj.tracker
          : typeof dataObj.token === 'string'
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
    const url = `${this.baseUrl}/order/v1/init`;
    const payload = {
      client: credentials.apiKey,
      amount: Number(input.money.amountMinor),
      currency: input.money.currency,
      environment: 'sandbox',
      metadata: input.metadata,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-sfpy-merchant-secret': credentials.v1Secret,
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
          (typeof innerData?.token === 'string' && innerData.token) ||
          (typeof data?.token === 'string' && data.token) ||
          `track_${Date.now()}`;

        const checkoutUrl = `${this.baseUrl}/checkout/pay?beacon=${token}&order_id=${input.metadata.paymentRequestId}`;
        const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

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
}
