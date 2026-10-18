import 'server-only';
import { z } from 'zod';
import { ApiSuccessSchema } from '../../contracts/api';
import { toApiError } from '../errors';

const noStoreHeaders = { 'Cache-Control': 'private, no-store' };

export function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export function successResponse(data: unknown, requestId: string, status = 200): Response {
  const body = ApiSuccessSchema(z.unknown()).parse({ data, meta: { requestId } });
  return Response.json(body, { status, headers: noStoreHeaders });
}

export function errorResponse(error: unknown, requestId: string): Response {
  const result = toApiError(error, requestId);
  return Response.json(result.body, { status: result.status, headers: noStoreHeaders });
}

export async function withApiErrors(requestId: string, operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
