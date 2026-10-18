import { expect,it } from 'vitest';
import { DomainEventSchema } from '../../src/contracts/events';
const event={id:'11111111-1111-4111-8111-111111111111',name:'lead.escalated',schemaVersion:1,workspaceId:'22222222-2222-4222-8222-222222222222',aggregate:{type:'lead',id:'33333333-3333-4333-8333-333333333333',version:2},occurredAt:'2026-10-18T08:00:00Z',actor:{kind:'system',membershipId:null},correlationId:'44444444-4444-4444-8444-444444444444',causationId:null,payload:{leadId:'33333333-3333-4333-8333-333333333333',contactId:'55555555-5555-4555-8555-555555555555',fromMembershipId:'66666666-6666-4666-8666-666666666666',toMembershipId:'77777777-7777-4777-8777-777777777777',assignmentVersion:2,tierLevel:1,source:'form',reason:'deadline_expired',assignedAt:'2026-10-18T08:00:00Z',ackDeadlineAt:'2026-10-18T08:01:00Z'}};
it('rejects invented escalation facts and unversioned secret payloads',()=>{
 expect(DomainEventSchema.parse(event)).toEqual(event);
 expect(DomainEventSchema.safeParse({...event,payload:{...event.payload,toMembershipId:event.payload.fromMembershipId}}).success).toBe(false);
 expect(DomainEventSchema.safeParse({...event,payload:{...event.payload,authToken:'not-for-events'}}).success).toBe(false);
 expect(DomainEventSchema.safeParse({...event,actor:{kind:'user',membershipId:null}}).success).toBe(false);
});
it('rejects domain event envelopes containing raw provider data',()=>{
 expect(DomainEventSchema.safeParse({...event,rawProvider:{body:'sensitive'}}).success).toBe(false);
});
