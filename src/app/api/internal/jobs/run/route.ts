import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { DomainError, fromDatabaseError } from '@/lib/errors';
import { newRequestId, successResponse, withApiErrors } from '@/lib/http/response';
import { readWorkerDispatchRequest, verifyDispatchSignature } from '@/modules/jobs/dispatch-security';

const JobKindSchema = z.enum([
  'integration.inbox.process',
  'messaging.send',
  'payments.checkout.create',
  'calendar.event.sync',
  'notifications.telegram.send',
  'domain.consume',
  'realtime.invalidate',
  'export.generate',
]);

const ClaimedJobSchema = z.strictObject({
  jobId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  eventId: z.string().uuid().nullable(),
  kind: JobKindSchema,
  payload: z.record(z.string(), z.unknown()),
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1).max(10),
  leaseToken: z.string().uuid(),
  leaseUntil: z.iso.datetime(),
});

const DispatchResultSchema = z.strictObject({
  accepted: z.boolean(),
  jobs: z.array(ClaimedJobSchema),
});

function getDispatchSecrets(): { currentSecret: string; previousSecret?: string } {
  const currentSecret = process.env.JOBS_DISPATCH_SECRET_CURRENT;
  const previousSecret = process.env.JOBS_DISPATCH_SECRET_PREVIOUS;
  if (!currentSecret) throw new DomainError('INTERNAL_ERROR');
  return { currentSecret, ...(previousSecret ? { previousSecret } : {}) };
}

function getWorkerDatabaseConfig(): { url: string; serviceRoleKey: string } {
  const value = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value || !serviceRoleKey) throw new DomainError('INTERNAL_ERROR');
  try {
    const url = new URL(value);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.pathname !== '/' || url.search || url.hash
      || (!localHttp && url.protocol !== 'https:')
      || Buffer.byteLength(serviceRoleKey, 'utf8') < 32
    ) throw new Error('invalid worker configuration');
    return { url: url.origin, serviceRoleKey };
  } catch {
    throw new DomainError('INTERNAL_ERROR');
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  return withApiErrors(requestId, async () => {
    const { rawBody, body } = await readWorkerDispatchRequest(request);
    const timestamp = request.headers.get('x-ubmp-job-timestamp');
    const nonce = request.headers.get('x-ubmp-job-nonce');
    const signature = request.headers.get('x-ubmp-job-signature');
    if (
      timestamp !== body.timestamp || nonce !== body.nonce || !signature
      || !verifyDispatchSignature({
        ...getDispatchSecrets(),
        timestamp,
        nonce,
        rawBody,
        signature,
      })
    ) throw new DomainError('UNAUTHENTICATED');

    const { url, serviceRoleKey } = getWorkerDatabaseConfig();
    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.rpc('dispatch_jobs', {
      p_nonce: nonce,
      p_signed_at: new Date(Number(timestamp) * 1_000).toISOString(),
      p_limit: body.batchSize,
    });
    if (error) throw fromDatabaseError(error);

    const dispatch = DispatchResultSchema.safeParse(data);
    if (!dispatch.success) throw new DomainError('INTERNAL_ERROR');
    if (!dispatch.data.accepted) throw new DomainError('CONFLICT');
    return successResponse({ claimed: dispatch.data.jobs.length, jobs: dispatch.data.jobs }, requestId);
  });
}
