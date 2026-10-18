import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  readWorkerDispatchRequest,
  WorkerDispatchRequestSchema,
  verifyDispatchSignature,
} from '@/modules/jobs/dispatch-security';

const currentSecret = 'current-test-secret-with-at-least-32-bytes';
const previousSecret = 'previous-test-secret-with-at-least-32-bytes';
const timestamp = '1792281600';
const nonce = '0123456789abcdefghijklmn';
const rawBody = JSON.stringify({ batchSize: 3, timestamp, nonce });
const nowMs = Number(timestamp) * 1000;

function sign(secret: string, body = rawBody, signedAt = timestamp, requestNonce = nonce): string {
  const digest = createHmac('sha256', secret)
    .update(`${signedAt}.${requestNonce}.${body}`, 'utf8')
    .digest('hex');
  return `v1=${digest}`;
}

describe('worker dispatch signature', () => {
  it('accepts a fresh signature from the current key', () => {
    expect(verifyDispatchSignature({
      currentSecret,
      timestamp,
      nonce,
      rawBody,
      signature: sign(currentSecret),
      nowMs,
    })).toBe(true);
  });

  it('accepts a fresh signature from the previous rotation key', () => {
    expect(verifyDispatchSignature({
      currentSecret,
      previousSecret,
      timestamp,
      nonce,
      rawBody,
      signature: sign(previousSecret),
      nowMs,
    })).toBe(true);
  });

  it('rejects altered bodies, malformed signatures and secrets shorter than 32 bytes', () => {
    expect(verifyDispatchSignature({
      currentSecret,
      timestamp,
      nonce,
      rawBody,
      signature: sign(currentSecret, rawBody.replace('3', '4')),
      nowMs,
    })).toBe(false);
    expect(verifyDispatchSignature({
      currentSecret,
      timestamp,
      nonce,
      rawBody,
      signature: 'v1=not-a-digest',
      nowMs,
    })).toBe(false);
    expect(verifyDispatchSignature({
      currentSecret: 'too-short',
      timestamp,
      nonce,
      rawBody,
      signature: sign('too-short'),
      nowMs,
    })).toBe(false);
  });

  it('rejects signatures outside the 30 second freshness window', () => {
    expect(verifyDispatchSignature({
      currentSecret,
      timestamp: String(Number(timestamp) - 31),
      nonce,
      rawBody,
      signature: sign(currentSecret, rawBody, String(Number(timestamp) - 31)),
      nowMs,
    })).toBe(false);
    expect(verifyDispatchSignature({
      currentSecret,
      timestamp: String(Number(timestamp) + 31),
      nonce,
      rawBody,
      signature: sign(currentSecret, rawBody, String(Number(timestamp) + 31)),
      nowMs,
    })).toBe(false);
  });
});

describe('worker dispatch request schema', () => {
  it('accepts only a bounded batch, timestamp and nonce', () => {
    expect(WorkerDispatchRequestSchema.parse({ batchSize: 3, timestamp, nonce })).toEqual({
      batchSize: 3,
      timestamp,
      nonce,
    });
    expect(WorkerDispatchRequestSchema.safeParse({ batchSize: 21, timestamp, nonce }).success).toBe(false);
    expect(WorkerDispatchRequestSchema.safeParse({ batchSize: 3, timestamp, nonce, workspaceId: 'attacker' }).success).toBe(false);
    expect(WorkerDispatchRequestSchema.safeParse({ batchSize: 3, timestamp, nonce: 'short' }).success).toBe(false);
  });

  it('retains the exact bounded body bytes used for signature verification', async () => {
    const request = new Request('https://app.example.test/api/internal/jobs/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: rawBody,
    });
    const result = await readWorkerDispatchRequest(request);
    expect(new TextDecoder().decode(result.rawBody)).toBe(rawBody);
    expect(result.body).toEqual({ batchSize: 3, timestamp, nonce });
  });

  it('rejects unsupported content types and bodies over one kilobyte', async () => {
    await expect(readWorkerDispatchRequest(new Request('https://app.example.test/jobs', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: rawBody,
    }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(readWorkerDispatchRequest(new Request('https://app.example.test/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: `${JSON.stringify({ batchSize: 3, timestamp, nonce })}${' '.repeat(1_024)}`,
    }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
