import { ApiErrorSchema, type ApiError, type ErrorCode } from '../../contracts/api';
const definitions:Record<ErrorCode,{status:number;message:string;retryable:boolean}>={
 VALIDATION_FAILED:{status:400,message:'Some values are invalid.',retryable:false},
 UNAUTHENTICATED:{status:401,message:'Sign in to continue.',retryable:false},
 FORBIDDEN:{status:403,message:'You do not have permission for this operation.',retryable:false},
 NOT_FOUND:{status:404,message:'The requested record was not found.',retryable:false},
 CONFLICT:{status:409,message:'This operation conflicts with the current state.',retryable:false},
 STALE_VERSION:{status:409,message:'This record has changed. Refresh and try again.',retryable:false},
 DEADLINE_EXPIRED:{status:409,message:'The acknowledgement deadline has expired.',retryable:false},
 ASSIGNMENT_CHANGED:{status:409,message:'The lead assignment has changed.',retryable:false},
 RATE_LIMITED:{status:429,message:'Too many requests. Try again later.',retryable:true},
 PROVIDER_UNAVAILABLE:{status:503,message:'The external service is temporarily unavailable.',retryable:true},
 RECONNECT_REQUIRED:{status:409,message:'Reconnect the external service to continue.',retryable:false},
 INTERNAL_ERROR:{status:500,message:'The request could not be completed.',retryable:false},
};
export class DomainError extends Error {
 readonly name='DomainError';
 constructor(readonly code:ErrorCode) { super(definitions[code].message); }
}
/** Message/details from Postgres never become public text. Specific SQLSTATEs are
 * safe to map; unknown database errors stay internal rather than leaking structure. */
export function fromDatabaseError(error:{code?:string;message?:string;details?:string}):DomainError {
 const codes:Record<string,ErrorCode>={PT401:'UNAUTHENTICATED',PT403:'FORBIDDEN',PT404:'NOT_FOUND',PT409:'STALE_VERSION',PT400:'VALIDATION_FAILED','23505':'CONFLICT','23503':'CONFLICT','23514':'VALIDATION_FAILED'};
 return new DomainError(codes[error.code??'']??'INTERNAL_ERROR');
}
export function toApiError(error:unknown,requestId:string):{status:number;body:ApiError} {
 const code=error instanceof DomainError?error.code:'INTERNAL_ERROR';
 const {status,message,retryable}=definitions[code];
 return {status,body:ApiErrorSchema.parse({error:{code,message,retryable,requestId}})};
}
