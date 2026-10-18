import { expect,it } from 'vitest';
import { DomainError, toApiError, fromDatabaseError } from '../../src/lib/errors';
it('redacts unexpected errors and ignores provider/database detail strings',()=>{
 expect(toApiError(new Error('secret credential details'),'req-1')).toEqual({status:500,body:{error:{code:'INTERNAL_ERROR',message:'The request could not be completed.',retryable:false,requestId:'req-1'}}});
 expect(toApiError(fromDatabaseError({code:'PT403',message:'private row contents',details:'sensitive'}),'req-2').body.error).toEqual({code:'FORBIDDEN',message:'You do not have permission for this operation.',retryable:false,requestId:'req-2'});
});
it('maps known conflicts and validates public error codes',()=>{
 expect(toApiError(new DomainError('STALE_VERSION'),'req').status).toBe(409);
 expect(toApiError(fromDatabaseError({code:'PT401'}),'req').status).toBe(401);
 expect(toApiError(fromDatabaseError({code:'23505'}),'req').status).toBe(409);
});
