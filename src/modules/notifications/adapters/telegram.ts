import {
  type NotificationAdapter,
  type NotificationCommand,
  type NotificationSent,
  type ProviderOutcome,
  NotificationCommandSchema,
} from '../../../contracts/integrations';

export class TelegramAdapter implements NotificationAdapter {
  private readonly baseUrl: string;

  constructor(options?: { baseUrl?: string }) {
    this.baseUrl = options?.baseUrl || 'https://api.telegram.org';
  }

  async send(
    input: NotificationCommand,
    token: string,
  ): Promise<ProviderOutcome<NotificationSent>> {
    const validated = NotificationCommandSchema.safeParse(input);
    if (!validated.success) {
      return {
        status: 'permanent_failure',
        code: 'INVALID_COMMAND',
      };
    }

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return {
        status: 'permanent_failure',
        code: 'AUTHENTICATION_FAILED',
      };
    }

    const cleanToken = token.trim();
    const url = `${this.baseUrl}/bot${cleanToken}/sendMessage`;
    const payload = {
      chat_id: input.chatId,
      text: input.text,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        const data = (await response.json()) as {
          ok?: boolean;
          result?: { message_id?: number | string };
        };
        const rawId = data?.result?.message_id;
        if (rawId === undefined || rawId === null) {
          return {
            status: 'unknown',
            code: 'MISSING_PROVIDER_REFERENCE',
            reconciliationReference: input.deliveryId,
          };
        }
        const messageId = String(rawId);
        return {
          status: 'confirmed',
          value: {
            messageId,
          },
          reference: messageId,
        };
      } catch {
        return {
          status: 'unknown',
          code: 'INVALID_PROVIDER_RESPONSE',
          reconciliationReference: input.deliveryId,
        };
      }
    }

    let description = '';
    let retryAfter: number | undefined;

    try {
      const errData = (await response.json()) as {
        description?: string;
        parameters?: { retry_after?: number };
      };
      if (typeof errData?.description === 'string') {
        description = errData.description.toLowerCase();
      }
      if (typeof errData?.parameters?.retry_after === 'number') {
        retryAfter = errData.parameters.retry_after;
      }
    } catch {
      // ignore
    }

    if (response.status === 429) {
      const headerVal = response.headers.get('retry-after');
      const headerSeconds = headerVal ? parseInt(headerVal, 10) : undefined;
      const retryAfterSeconds = Math.min(
        Math.max(retryAfter ?? headerSeconds ?? 30, 1),
        86400,
      );
      return {
        status: 'temporary_failure',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds,
      };
    }

    if (response.status === 403) {
      if (description.includes('blocked')) {
        return {
          status: 'permanent_failure',
          code: 'BOT_BLOCKED',
        };
      }
      return {
        status: 'permanent_failure',
        code: 'FORBIDDEN',
      };
    }

    if (response.status === 400) {
      if (description.includes('chat not found')) {
        return {
          status: 'permanent_failure',
          code: 'CHAT_NOT_FOUND',
        };
      }
      if (description.includes('too long')) {
        return {
          status: 'permanent_failure',
          code: 'MESSAGE_TOO_LONG',
        };
      }
      return {
        status: 'permanent_failure',
        code: 'INVALID_MESSAGE',
      };
    }

    if (response.status === 401) {
      return {
        status: 'permanent_failure',
        code: 'AUTHENTICATION_FAILED',
      };
    }

    if (response.status >= 500 && response.status < 600) {
      return {
        status: 'temporary_failure',
        code: 'TELEGRAM_SERVER_ERROR',
        retryAfterSeconds: 30,
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
