/** SYNTHETIC preview fixtures. Never import these into live application routes. */
import { DashboardSnapshotSchema, SessionViewSchema, ContactSummarySchema, LeadSummarySchema } from '../../src/contracts/ui';
export const syntheticSession=SessionViewSchema.parse({
 user:{id:'11111111-1111-4111-8111-111111111111',displayName:'Preview Owner',email:'owner@example.test'},
 workspace:{id:'22222222-2222-4222-8222-222222222222',name:'Synthetic Service Co.',timezone:'Asia/Karachi',defaultCurrency:'PKR'},
 membershipId:'33333333-3333-4333-8333-333333333333',baseLevel:'owner',
 navigation:[{id:'dashboard',label:'Overview',href:'/dashboard',icon:'overview',enabled:true},{id:'contacts',label:'Contacts',href:'/contacts',icon:'contacts',enabled:false}],
});
export const syntheticDashboard=DashboardSnapshotSchema.parse({
 scope:'company',workspaceId:syntheticSession.workspace.id,asOf:'2026-10-18T08:00:00Z',timezone:'Asia/Karachi',
 metrics:[{id:'new_leads_today',label:'New leads today',visibility:'visible',value:{kind:'count',value:12},drilldownHref:'/leads'},
 {id:'open_pipeline_value',label:'Open pipeline value',visibility:'restricted'},
 {id:'first_response_seconds',label:'First response',visibility:'visible',value:{kind:'duration',seconds:null},drilldownHref:null},
 {id:'payments_month',label:'Gross payments this month',visibility:'visible',value:{kind:'money',totals:[{amountMinor:'75000',currency:'PKR'},{amountMinor:'1000',currency:'USD'}]},drilldownHref:'/payments'},
 {id:'net_collections_month',label:'Net collections this month',visibility:'visible',value:{kind:'money',totals:[{amountMinor:'-5000',currency:'PKR'},{amountMinor:'1000',currency:'USD'}]},drilldownHref:'/payments'}],
 openPipelineByStage:{visibility:'restricted'},upcomingAppointments:[],
 collections:{visibility:'visible',grossPayments:[{amountMinor:'75000',currency:'PKR'},{amountMinor:'1000',currency:'USD'}],confirmedRefunds:[{amountMinor:'80000',currency:'PKR'}],netCollected:[{amountMinor:'-5000',currency:'PKR'},{amountMinor:'1000',currency:'USD'}]},
});
export const syntheticContact=ContactSummarySchema.parse({id:'44444444-4444-4444-8444-444444444444',name:'Preview Customer',companyName:null,ownerName:'Preview Owner'});
export const syntheticLead=LeadSummarySchema.parse({id:'55555555-5555-4555-8555-555555555555',contact:syntheticContact,source:'form',ownerName:'Preview Owner',ownershipMode:'custody',ackDeadlineAt:null,recoveryReasons:['awaiting_eligible_employee']});
