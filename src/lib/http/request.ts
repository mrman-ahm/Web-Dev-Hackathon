import { DomainError } from '../errors';

export function assertSameOrigin(request: Request, configuredOrigin: string): void {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') throw new DomainError('FORBIDDEN');

  try {
    const expected = new URL(configuredOrigin);
    const received = new URL(origin);
    if (expected.origin !== configuredOrigin || received.origin !== origin || received.origin !== expected.origin) {
      throw new DomainError('FORBIDDEN');
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('FORBIDDEN');
  }
}

export async function readJson(request: Request, maxBytes = 1_048_576): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new DomainError('INTERNAL_ERROR');
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') throw new DomainError('VALIDATION_FAILED');

  const claimedLength = request.headers.get('content-length');
  if (claimedLength && /^\d+$/.test(claimedLength) && BigInt(claimedLength) > BigInt(maxBytes)) {
    throw new DomainError('VALIDATION_FAILED');
  }

  const reader = request.body?.getReader();
  if (!reader) throw new DomainError('VALIDATION_FAILED');
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
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

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new DomainError('VALIDATION_FAILED');
  }
}
