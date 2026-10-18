import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramAdapter } from '../../../src/modules/notifications/adapters/telegram';
import type { NotificationCommand } from '../../../src/contracts/integrations';

describe('TelegramAdapter', () => {
  const token = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz_0123456';

  const command: NotificationCommand = {
    deliveryId: '550e8400-e29b-41d4-a716-446655440001',
    chatId: '-1001234567890',
    text: 'Escalation alert: Unacknowledged lead #42 requires immediate response. https://crm.example.com/leads/42',
  };

  let adapter: TelegramAdapter;

  beforeEach(() => {
    adapter = new TelegramAdapter();
    vi.restoreAllMocks();
  });

  describe('send - Notification Message Delivery', () => {
    it('successfully sends message and returns confirmed outcome with messageId', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            message_id: 884422,
            date: 1729245600,
            chat: { id: -1001234567890, type: 'supergroup' },
            text: command.text,
          },
        }),
      });
      global.fetch = mockFetch;

      const outcome = await adapter.send(command, token);

      expect(outcome.status).toBe('confirmed');
      if (outcome.status === 'confirmed') {
        expect(outcome.reference).toBe('884422');
        expect(outcome.value.messageId).toBe('884422');
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
      expect(call).toBeDefined();
      const [url, options] = call;
      expect(url).toContain('/sendMessage');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe(command.chatId);
      expect(body.text).toBe(command.text);
    });

    it('maps 429 rate limit to temporary_failure and extracts retry_after from parameters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '25' }),
        json: async () => ({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests: retry after 25',
          parameters: {
            retry_after: 25,
          },
        }),
      });

      const outcome = await adapter.send(command, token);

      expect(outcome.status).toBe('temporary_failure');
      if (outcome.status === 'temporary_failure') {
        expect(outcome.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(outcome.retryAfterSeconds).toBe(25);
      }
    });

    it('maps 403 bot blocked by user to permanent_failure with BOT_BLOCKED', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({
          ok: false,
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        }),
      });

      const outcome = await adapter.send(command, token);

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('BOT_BLOCKED');
      }
    });

    it('maps 400 chat not found to permanent_failure with CHAT_NOT_FOUND', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        }),
      });

      const outcome = await adapter.send(command, token);

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('CHAT_NOT_FOUND');
      }
    });

    it('maps 401 unauthorized to permanent_failure with AUTHENTICATION_FAILED', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({
          ok: false,
          error_code: 401,
          description: 'Unauthorized: invalid bot token',
        }),
      });

      const outcome = await adapter.send(command, token);

      expect(outcome.status).toBe('permanent_failure');
      if (outcome.status === 'permanent_failure') {
        expect(outcome.code).toBe('AUTHENTICATION_FAILED');
      }
    });

    it('maps 502/503 server error to temporary_failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: new Headers(),
        json: async () => ({
          ok: false,
          error_code: 502,
          description: 'Bad Gateway',
        }),
      });

      const outcome = await adapter.send(command, token);

      expect(outcome.status).toBe('temporary_failure');
      if (outcome.status === 'temporary_failure') {
        expect(outcome.code).toBe('TELEGRAM_SERVER_ERROR');
        expect(outcome.retryAfterSeconds).toBeDefined();
      }
    });

    it('maps network timeout / abort to unknown outcome with deliveryId reference', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const outcome = await adapter.send(command, token);

      expect(outcome.status).toBe('unknown');
      if (outcome.status === 'unknown') {
        expect(outcome.code).toBe('NETWORK_TIMEOUT');
        expect(outcome.reconciliationReference).toBe(command.deliveryId);
      }
    });

    it('maps fetch network failure to unknown outcome', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const outcome = await adapter.send(command, token);

      expect(outcome.status).toBe('unknown');
      if (outcome.status === 'unknown') {
        expect(outcome.code).toBe('NETWORK_ERROR');
        expect(outcome.reconciliationReference).toBe(command.deliveryId);
      }
    });

    it('never logs or leaks bot token in error returns or exceptions', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error(`Failed to request https://api.telegram.org/bot${token}/sendMessage`));

      const outcome = await adapter.send(command, token);

      expect(outcome.status).toBe('unknown');
      // Verify no field in outcome contains the raw token
      const stringified = JSON.stringify(outcome);
      expect(stringified).not.toContain(token);
    });
  });
});
