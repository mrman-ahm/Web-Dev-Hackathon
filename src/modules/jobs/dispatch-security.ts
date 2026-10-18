import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '@/lib/errors';

const unixTimestamp = z.string().regex(/^(0|[1-9][0-9]{0,10})$/);
const dispatchNonce = z.string().regex(/^[A-Za-z0-9_-]{22,128}$/);

export const WorkerDispatchRequestSchema = z.strictObject({
  batchSize: z.number().int().min(1).max(20),
  timestamp: unixTimestamp,
  nonce: dispatchNonce,
});

export type WorkerDispatchRequest = z.infer<typeof WorkerDispatchRequestSchema>;

export async function readWorkerDispatchRequest(request: Request): Promise<{
  rawBody: Uint8Array;
  body: WorkerDispatchRequest;
}> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') throw new DomainError('VALIDATION_FAILED');

  const claimedLength = request.headers.get('content-length');
  if (claimedLength !== null) {
    if (!/^\d+$/.test(claimedLength) || BigInt(claimedLength) > 1_024n) {
      throw new DomainError('VALIDATION_FAILED');
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new DomainError('VALIDATION_FAILED');

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > 1_024) {
        await reader.cancel().catch(() => undefined);
        throw new DomainError('VALIDATION_FAILED');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('VALIDATION_FAILED');
  } finally {
    reader.releaseLock();
  }

  const rawBody = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    rawBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)) as unknown;
    return { rawBody, body: WorkerDispatchRequestSchema.parse(parsed) };
  } catch {
    throw new DomainError('VALIDATION_FAILED');
  }
}

type VerifyDispatchSignatureInput = {
  currentSecret: string;
  previousSecret?: string;
  timestamp: string;
  nonce: string;
  rawBody: Uint8Array | string;
  signature: string;
  nowMs?: number;
};

export function verifyDispatchSignature(input: VerifyDispatchSignatureInput): boolean {
  const timestampResult = unixTimestamp.safeParse(input.timestamp);
  if (!timestampResult.success || !dispatchNonce.safeParse(input.nonce).success) return false;
  const signedAt = Number(input.timestamp);
  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isSafeInteger(signedAt) || !Number.isFinite(nowMs) || Math.abs(nowMs / 1_000 - signedAt) > 30) {
    return false;
  }

  const supplied = /^v1=([a-f0-9]{64})$/.exec(input.signature);
  const suppliedHex = supplied?.[1];
  if (!suppliedHex || Buffer.byteLength(input.currentSecret, 'utf8') < 32) return false;
  if (input.previousSecret !== undefined && Buffer.byteLength(input.previousSecret, 'utf8') < 32) return false;
  const suppliedDigest = Buffer.from(suppliedHex, 'hex');
  const messagePrefix = Buffer.from(`${input.timestamp}.${input.nonce}.`, 'utf8');
  const body = typeof input.rawBody === 'string' ? Buffer.from(input.rawBody, 'utf8') : input.rawBody;

  let matched = 0;
  for (const secret of [input.currentSecret, input.previousSecret]) {
    if (secret === undefined) continue;
    const expected = createHmac('sha256', Buffer.from(secret, 'utf8'))
      .update(messagePrefix)
      .update(body)
      .digest();
    matched |= Number(timingSafeEqual(expected, suppliedDigest));
  }
  return matched === 1;
}
