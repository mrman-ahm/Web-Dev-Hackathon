import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

import { POST } from '@/app/api/internal/jobs/run/route';

const secret = 'test-worker-secret-with-at-least-32-bytes';
const envNames = [
  'JOBS_DISPATCH_SECRET_CURRENT',
  'JOBS_DISPATCH_SECRET_PREVIOUS',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;
const originalEnv = new Map(envNames.map((name) => [name, process.env[name]]));

function requestFor(input: { tamperBody?: boolean; bodyNonce?: string } = {}): Request {
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonce = 'dispatch-route-test-nonce-0001';
  const rawBody = JSON.stringify({ batchSize: 2, timestamp, nonce: input.bodyNonce ?? nonce });
  const body = input.tamperBody ? `${rawBody} ` : rawBody;
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${rawBody}`, 'utf8')
    .digest('hex');
  return new Request('http://localhost:3000/api/internal/jobs/run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ubmp-job-timestamp': timestamp,
      'x-ubmp-job-nonce': nonce,
      'x-ubmp-job-signature': `v1=${digest}`,
    },
    body,
  });
}

beforeEach(() => {
  process.env.JOBS_DISPATCH_SECRET_CURRENT = secret;
  delete process.env.JOBS_DISPATCH_SECRET_PREVIOUS;
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-service-role-test-key-with-32-bytes';
  rpcMock.mockReset();
});

afterEach(() => {
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('internal worker dispatch route', () => {
  it('rejects a body that differs from the signed original bytes before database access', async () => {
    const response = await POST(requestFor({ tamperBody: true }));
    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('claims only through the narrow server RPC after a valid signature', async () => {
    rpcMock.mockResolvedValueOnce({ data: { accepted: true, jobs: [] }, error: null });
    const request = requestFor();
    const timestamp = request.headers.get('x-ubmp-job-timestamp');
    const nonce = request.headers.get('x-ubmp-job-nonce');

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('dispatch_jobs', expect.objectContaining({
      p_nonce: nonce,
      p_signed_at: new Date(Number(timestamp) * 1_000).toISOString(),
      p_limit: 2,
    }));
    expect(await response.json()).toMatchObject({ data: { claimed: 0, jobs: [] } });
  });

  it('returns conflict for a nonce already consumed by the database', async () => {
    rpcMock.mockResolvedValueOnce({ data: { accepted: false, jobs: [] }, error: null });
    const response = await POST(requestFor());
    expect(response.status).toBe(409);
  });
});
