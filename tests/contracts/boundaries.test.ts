import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MoneySchema, MoneyTotalSchema } from '../../src/contracts/common';
import { DashboardMetricSchema, PipelineTotalsSchema } from '../../src/contracts/ui';
import { SignupInputSchema, UpdateWorkspaceInputSchema, ApiErrorSchema } from '../../src/contracts/api';
import { ProviderOutcomeSchema, VerifiedPaymentEventSchema, SendMessageCommandSchema } from '../../src/contracts/integrations';

describe('money boundaries', () => {
 it.each(['-1','1.2','1e3','01',' 2','9007199254740992.5'])('rejects noncanonical transfer amount %s', amountMinor => {
  expect(MoneySchema.safeParse({amountMinor,currency:'USD'}).success).toBe(false);
 });
 it('retains integer precision beyond JavaScript numeric bounds and signed net totals', () => {
  expect(MoneySchema.parse({amountMinor:'9007199254740993',currency:'USD'})).toEqual({amountMinor:'9007199254740993',currency:'USD'});
  expect(MoneyTotalSchema.parse({amountMinor:'-500',currency:'PKR'})).toEqual({amountMinor:'-500',currency:'PKR'});
 });
 it('rejects malformed currencies and unexpected fields', () => {
  expect(MoneySchema.safeParse({amountMinor:'100',currency:'usd'}).success).toBe(false);
  expect(MoneySchema.safeParse({amountMinor:'100',currency:'USD',cardNumber:'sensitive'}).success).toBe(false);
 });
});
describe('restricted data cannot leave core projections', () => {
 const restricted = {id:'open_pipeline_value',label:'Pipeline',visibility:'restricted'};
 it('rejects restricted metrics with leaked values or drilldown links', () => {
  expect(DashboardMetricSchema.parse(restricted)).toEqual(restricted);
  expect(DashboardMetricSchema.safeParse({...restricted,value:{kind:'money',totals:[]}}).success).toBe(false);
  expect(DashboardMetricSchema.safeParse({...restricted,drilldownHref:'/private'}).success).toBe(false);
 });
 it('rejects stage totals on a restricted pipeline', () => {
  expect(PipelineTotalsSchema.safeParse({visibility:'restricted',stages:[]}).success).toBe(false);
 });
 it('rejects unsafe navigation on visible metrics', () => {
  expect(DashboardMetricSchema.safeParse({id:'new_leads_today',label:'New',visibility:'visible',value:{kind:'count',value:1},drilldownHref:'javascript:alert(1)'}).success).toBe(false);
 });
});
describe('request and error boundaries', () => {
 const signup = {email:'owner@example.test',password:'a-long-test-password',displayName:'Owner',workspaceName:'Acme',timezone:'Asia/Karachi',defaultCurrency:'PKR'};
 it('rejects client supplied authorization and invalid timezone', () => {
  expect(SignupInputSchema.parse(signup)).toEqual(signup);
  expect(SignupInputSchema.safeParse({...signup,baseLevel:'owner'}).success).toBe(false);
  expect(SignupInputSchema.safeParse({...signup,timezone:'imaginary/time'}).success).toBe(false);
 });
 it('requires a positive safe version for compare-and-swap writes', () => {
  const input={name:'Acme',timezone:'UTC',defaultCurrency:'USD'};
  for(const expectedVersion of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]) expect(UpdateWorkspaceInputSchema.safeParse({...input,expectedVersion}).success).toBe(false);
 });
 it('rejects stack or raw provider data in public errors', () => {
  const error={code:'INTERNAL_ERROR',message:'Request failed',retryable:false,requestId:'request-123'};
  expect(ApiErrorSchema.safeParse({error:{...error,stack:'secret internal trace'}}).success).toBe(false);
 });
});
describe('provider normalization boundaries', () => {
 it('does not confuse pending or uncertain external outcomes with confirmation', () => {
  const schema=ProviderOutcomeSchema(z.strictObject({messageId:z.string()}));
  expect(schema.safeParse({status:'confirmed',value:{messageId:'42'}}).success).toBe(false);
  expect(schema.safeParse({status:'temporary_failure',code:'THROTTLED',retryAfterSeconds:-1}).success).toBe(false);
  expect(schema.safeParse({status:'unknown',code:'TIMEOUT',value:{messageId:'42'},reference:'42'}).success).toBe(false);
 });
 it('rejects payment events without verifiable normalized identity and amount', () => {
  expect(VerifiedPaymentEventSchema.safeParse({type:'payment.confirmed',providerEventId:'evt_test'}).success).toBe(false);
 });
 it('rejects unsupported or malformed phone destinations', () => {
  expect(SendMessageCommandSchema.safeParse({deliveryId:'x',channel:'sms',from:'abc',to:'123',body:'hello'}).success).toBe(false);
 });
});

import { DashboardSnapshotSchema } from '../../src/contracts/ui';
import { syntheticDashboard } from '../fixtures/ui';
it('requires explicit restriction instead of leaked collection arrays',()=>{
 expect(DashboardSnapshotSchema.safeParse({...syntheticDashboard,collections:{visibility:'restricted',netCollected:[{amountMinor:'100',currency:'USD'}]}}).success).toBe(false);
 expect(DashboardSnapshotSchema.parse({...syntheticDashboard,collections:{visibility:'restricted'}}).collections).toEqual({visibility:'restricted'});
});
it('rejects currency-shaped strings that are not ISO currencies',()=>{
 expect(MoneySchema.safeParse({amountMinor:'100',currency:'ZZZ'}).success).toBe(false);
});
it('compares appointment instants by time rather than lexical fractional spelling',async()=>{
 const { AppointmentSummarySchema }=await import('../../src/contracts/ui');
 expect(AppointmentSummarySchema.safeParse({id:'11111111-1111-4111-8111-111111111111',contactName:'Customer',employeeName:'Owner',startsAt:'2026-10-18T08:00:00Z',endsAt:'2026-10-18T08:00:00.100Z',timezone:'UTC',status:'confirmed'}).success).toBe(true);
});
