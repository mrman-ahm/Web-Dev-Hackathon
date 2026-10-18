import twilio from 'twilio';
import { PhoneE164Schema } from '@/contracts/common';
import {
  AdapterVerificationError,
  MessagingAdapter,
  ProviderOutcome,
  RawWebhook,
  SendMessageCommand,
  SentMessage,
  TwilioCredentials,
  VerifiedMessageEvent,
  VerifiedMessageEventSchema,
} from '@/contracts/integrations';

export interface TwilioClientLike {
  messages: {
    create: (opts: {
      from: string;
      to: string;
      body: string;
      statusCallback?: string;
    }) => Promise<{ sid: string; status: string }>;
  };
}

export type TwilioClientFactory = (accountSid: string, authToken: string) => TwilioClientLike;

const defaultClientFactory: TwilioClientFactory = (accountSid, authToken) => twilio(accountSid, authToken);

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_KEYWORDS = new Set(['START', 'YES', 'UNSTOP']);
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

const DELIVERY_STATUSES = new Set([
  'queued',
  'sending',
  'accepted',
  'scheduled',
  'sent',
  'delivered',
  'read',
  'undelivered',
  'failed',
  'canceled',
]);

export class TwilioMessagingAdapter implements MessagingAdapter {
  constructor(private readonly clientFactory: TwilioClientFactory = defaultClientFactory) {}

  verifyInbound(input: RawWebhook, credentials: TwilioCredentials): VerifiedMessageEvent {
    const contentTypeHeader = input.headers.get('content-type') ?? '';
    const contentType = (contentTypeHeader.split(';')[0] ?? '').trim().toLowerCase();

    if (contentType !== 'application/x-www-form-urlencoded' && contentType !== 'application/json') {
      throw new AdapterVerificationError('UNSUPPORTED_CONTENT_TYPE');
    }

    const signature = input.headers.get('x-twilio-signature');
    if (!signature) {
      throw new AdapterVerificationError('INVALID_SIGNATURE');
    }

    let params: Record<string, string>;
    const bodyText = new TextDecoder('utf-8').decode(input.rawBody);

    if (contentType === 'application/x-www-form-urlencoded') {
      const searchParams = new URLSearchParams(bodyText);
      params = Object.fromEntries(searchParams.entries());

      const isValid = twilio.validateRequest(
        credentials.authToken,
        signature,
        input.canonicalUrl,
        params,
      );
      if (!isValid) {
        throw new AdapterVerificationError('INVALID_SIGNATURE');
      }
    } else {
      let jsonPayload: unknown;
      try {
        jsonPayload = JSON.parse(bodyText);
      } catch {
        throw new AdapterVerificationError('INVALID_PAYLOAD');
      }

      if (typeof jsonPayload !== 'object' || jsonPayload === null) {
        throw new AdapterVerificationError('INVALID_PAYLOAD');
      }

      const isValid = twilio.validateRequestWithBody(
        credentials.authToken,
        signature,
        input.canonicalUrl,
        bodyText,
      );
      if (!isValid) {
        throw new AdapterVerificationError('INVALID_SIGNATURE');
      }

      params = Object.fromEntries(
        Object.entries(jsonPayload as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
      );
    }

    const accountSid = params.AccountSid;
    if (!accountSid || accountSid !== credentials.accountSid) {
      throw new AdapterVerificationError('CONNECTION_MISMATCH');
    }

    const messageSid = params.MessageSid || params.SmsSid;
    if (!messageSid || typeof messageSid !== 'string' || messageSid.trim() === '') {
      throw new AdapterVerificationError('INVALID_PAYLOAD');
    }

    const rawFrom = params.From;
    const rawTo = params.To;
    if (!rawFrom || !rawTo) {
      throw new AdapterVerificationError('INVALID_PAYLOAD');
    }

    const isFromWhatsApp = rawFrom.startsWith('whatsapp:');
    const isToWhatsApp = rawTo.startsWith('whatsapp:');

    let cleanFrom: string;
    let cleanTo: string;

    if (credentials.channel === 'whatsapp') {
      if (!isFromWhatsApp || !isToWhatsApp) {
        throw new AdapterVerificationError('CONNECTION_MISMATCH');
      }
      cleanFrom = rawFrom.slice('whatsapp:'.length);
      cleanTo = rawTo.slice('whatsapp:'.length);
    } else {
      if (isFromWhatsApp || isToWhatsApp) {
        throw new AdapterVerificationError('CONNECTION_MISMATCH');
      }
      cleanFrom = rawFrom;
      cleanTo = rawTo;
    }

    const fromValidation = PhoneE164Schema.safeParse(cleanFrom);
    const toValidation = PhoneE164Schema.safeParse(cleanTo);
    if (!fromValidation.success || !toValidation.success) {
      throw new AdapterVerificationError('INVALID_PAYLOAD');
    }

    const rawStatus = (params.MessageStatus || params.SmsStatus || '').trim().toLowerCase();

    if (DELIVERY_STATUSES.has(rawStatus)) {
      if (cleanFrom !== credentials.from) {
        throw new AdapterVerificationError('CONNECTION_MISMATCH');
      }

      let state: 'pending' | 'sent' | 'delivered' | 'failed';
      if (['queued', 'sending', 'accepted', 'scheduled'].includes(rawStatus)) {
        state = 'pending';
      } else if (rawStatus === 'sent') {
        state = 'sent';
      } else if (rawStatus === 'delivered' || rawStatus === 'read') {
        state = 'delivered';
      } else {
        state = 'failed';
      }

      let errorCode: string | null = null;
      if (params.ErrorCode && params.ErrorCode.trim() !== '' && params.ErrorCode.trim() !== '0') {
        errorCode = params.ErrorCode.trim();
      }

      const providerEventId = `${messageSid}:${state}${errorCode ? `:${errorCode}` : ''}`;

      const statusEvent: VerifiedMessageEvent = {
        provider: 'twilio',
        kind: 'message.status',
        providerEventId,
        providerMessageRef: messageSid,
        accountSid: credentials.accountSid,
        channel: credentials.channel,
        from: cleanFrom,
        to: cleanTo,
        state,
        errorCode,
      };

      const parsed = VerifiedMessageEventSchema.safeParse(statusEvent);
      if (!parsed.success) {
        throw new AdapterVerificationError('INVALID_PAYLOAD');
      }
      return parsed.data;
    }

    if (rawStatus === 'received' || rawStatus === '') {
      if (cleanTo !== credentials.from) {
        throw new AdapterVerificationError('CONNECTION_MISMATCH');
      }

      const body = params.Body ?? '';
      let optOut: 'none' | 'stop' | 'start' | 'help' = 'none';

      const optOutType = (params.OptOutType ?? '').trim().toUpperCase();
      if (optOutType === 'STOP') {
        optOut = 'stop';
      } else if (optOutType === 'START') {
        optOut = 'start';
      } else if (optOutType === 'HELP') {
        optOut = 'help';
      } else {
        const bodyNormalized = body.trim().toUpperCase();
        if (STOP_KEYWORDS.has(bodyNormalized)) {
          optOut = 'stop';
        } else if (START_KEYWORDS.has(bodyNormalized)) {
          optOut = 'start';
        } else if (HELP_KEYWORDS.has(bodyNormalized)) {
          optOut = 'help';
        }
      }

      const receivedEvent: VerifiedMessageEvent = {
        provider: 'twilio',
        kind: 'message.received',
        providerEventId: messageSid,
        providerMessageRef: messageSid,
        accountSid: credentials.accountSid,
        channel: credentials.channel,
        from: cleanFrom,
        to: cleanTo,
        body,
        optOut,
      };

      const parsed = VerifiedMessageEventSchema.safeParse(receivedEvent);
      if (!parsed.success) {
        throw new AdapterVerificationError('INVALID_PAYLOAD');
      }
      return parsed.data;
    }

    throw new AdapterVerificationError('INVALID_PAYLOAD');
  }

  async send(
    input: SendMessageCommand,
    credentials: TwilioCredentials,
  ): Promise<ProviderOutcome<SentMessage>> {
    const from = input.channel === 'whatsapp' ? `whatsapp:${input.from}` : input.from;
    const to = input.channel === 'whatsapp' ? `whatsapp:${input.to}` : input.to;

    const client = this.clientFactory(credentials.accountSid, credentials.authToken);

    try {
      const response = await client.messages.create({
        from,
        to,
        body: input.body,
        statusCallback: input.statusCallbackUrl,
      });

      const state: 'pending' | 'sent' = response.status === 'sent' ? 'sent' : 'pending';

      return {
        status: 'confirmed',
        value: {
          providerMessageRef: response.sid,
          state,
          channel: input.channel,
        },
        reference: response.sid,
      };
    } catch (error: unknown) {
      return this.classifySendError(error);
    }
  }

  private classifySendError(error: unknown): ProviderOutcome<SentMessage> {
    const err = error as {
      status?: number;
      code?: number | string;
      message?: string;
      name?: string;
      headers?: Record<string, string>;
      retryAfter?: number;
    };

    const errorCode = typeof err?.code === 'string' ? err.code : '';
    const errorName = err?.name ?? '';
    const errorMessage = err?.message ?? '';

    const isTimeout =
      errorCode === 'ETIMEDOUT' ||
      errorCode === 'ESOCKETTIMEDOUT' ||
      errorCode === 'ECONNRESET' ||
      errorCode === 'EAI_AGAIN' ||
      errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
      errorName === 'TimeoutError' ||
      errorName === 'AbortError' ||
      /timeout|timed out|socket hang up/i.test(errorMessage);

    if (isTimeout) {
      return {
        status: 'unknown',
        code: 'NETWORK_TIMEOUT',
      };
    }

    const httpStatus = err?.status;
    const twilioCode = typeof err?.code === 'number' ? err.code : undefined;

    if (httpStatus === 429 || twilioCode === 20429) {
      let retryAfterSeconds: number | undefined;
      const retryHeader = err?.headers?.['retry-after'];
      if (retryHeader) {
        const parsed = parseInt(retryHeader, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 86400) {
          retryAfterSeconds = parsed;
        }
      } else if (typeof err?.retryAfter === 'number' && err.retryAfter >= 0 && err.retryAfter <= 86400) {
        retryAfterSeconds = Math.floor(err.retryAfter);
      }

      return {
        status: 'temporary_failure',
        code: 'RATE_LIMIT',
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      };
    }

    if (httpStatus !== undefined && httpStatus >= 500) {
      return {
        status: 'temporary_failure',
        code: 'PROVIDER_ERROR',
      };
    }

    if (httpStatus === 401 || twilioCode === 20003) {
      return {
        status: 'permanent_failure',
        code: 'AUTHENTICATION_FAILED',
      };
    }

    if (httpStatus === 403 || twilioCode === 21408) {
      return {
        status: 'permanent_failure',
        code: 'PERMISSION_DENIED',
      };
    }

    if (httpStatus === 404 || twilioCode === 20404) {
      return {
        status: 'permanent_failure',
        code: 'NOT_FOUND',
      };
    }

    if (
      httpStatus === 400 ||
      twilioCode === 21211 ||
      twilioCode === 21614 ||
      twilioCode === 21610
    ) {
      if (twilioCode === 21211 || twilioCode === 21614) {
        return {
          status: 'permanent_failure',
          code: 'INVALID_DESTINATION',
        };
      }
      return {
        status: 'permanent_failure',
        code: 'BAD_REQUEST',
      };
    }

    if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
      return {
        status: 'permanent_failure',
        code: 'BAD_REQUEST',
      };
    }

    return {
      status: 'unknown',
      code: 'UNKNOWN_ERROR',
    };
  }
}
