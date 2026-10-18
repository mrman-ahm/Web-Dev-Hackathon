# Domain events and delivery contract

Status: approved v1 design (2026-10-18). Immutable domain facts/outbox intent commit with the domain write.
No broker or event-sourced replacement for relational state is introduced.

## Envelope and delivery

```ts
type DomainEvent<N extends string,P> = {
  id:string;name:N;schemaVersion:1;workspaceId:string;
  aggregate:{type:string;id:string;version:number};occurredAt:string;
  actor:{kind:'user'|'system'|'provider';membershipId:string|null};
  correlationId:string;causationId:string|null;payload:P;
};
```

UUID event IDs; database UTC occurrence time; actor derived from authenticated command,
verified provider connection or fixed worker identity. Payload schemas live in
`src/contracts/events.ts` and are inferred, versioned and tested. Raw providers, secrets,
card data and unnecessary personal content never enter envelopes.

Outbox consumers receive at least once, not exactly once. A consumer records its
`(consumer_name,event_id)` receipt atomically with database effects. Each external
side effect uses its own delivery/semantic idempotency record. Retry an event safely;
no consumer may infer success from enqueue. Domain event ordering is guaranteed only
by aggregate version/transaction, not global HTTP arrival. Consumers must reject stale
versions where relevant and reconcile providers whose event ordering differs.
Audit/activity entries are written by the originating transaction, not only a later
best-effort event consumer. Event delivery failure cannot erase the original history.

## Adopted event payloads

Every row uses the envelope above; payload keys are exact. All IDs are workspace-scoped
and validated against the envelope. Types `Id`/`Instant` are UUID/UTC string.

| Name / producer | Payload | Consumers / audit behavior |
| --- | --- | --- |
| `identity.user_registered` / identity | `{userId,workspaceId,membershipId}` | provisioning observer; bootstrap audit already committed |
| `workspace.created` / identity | `{ownerMembershipId}` | safe welcome/UI invalidation; audit workspace create |
| `membership.changed` / identity | `{membershipId,change:'invited'|'joined'|'level_changed'|'deactivated'|'owner_transferred'}` | permission invalidation, custody/absence services; audit before/after |
| `permissions.changed` / permissions | `{roleId:Id|null,membershipId:Id|null,permissionKeys:string[]}` | session/navigation refetch; audit grants before/after |
| `contact.created` / CRM | `{contactId}` | activity/read-model invalidation; audit |
| `contact.updated` / CRM | `{contactId,changedFields:string[]}` | activity/read-model invalidation; audit masked diffs |
| `contact.deleted` / CRM | `{contactId,mode:'archived'|'deleted'}` | related permitted views; preserve audit identity |
| `crm.configuration_changed` / CRM | `{kind:'pipeline'|'stage'|'field'|'filter'|'tag',recordId,change:string}` | forms/list invalidation; audit before/after |
| `opportunity.stage_changed` / CRM | `{opportunityId,contactId,fromStageId,toStageId,leadId:Id|null}` | activity/dashboard; qualifying ack performed in originating transaction |
| `lead.created` / leads | `{leadId,contactId,source:'form'|'message'|'manual',ownershipMode:'operational'|'custody'}` | invalidation/recovery observer; initial ownership and audit already atomic |
| `lead.assigned` / leads | `{leadId,contactId,ownerMembershipId,assignmentVersion,tierLevel,assignedAt,ackDeadlineAt,reason:'initial'|'eligibility_recovered'}` | in-app invalidation; activity/audit already committed |
| `lead.acknowledged` / leads | `{leadId,assignmentVersion,ownerMembershipId,actionKind,acknowledgedAt,firstAcknowledgedAt}` | dashboard/invalidation; audit plus immutable ack |
| `lead.escalated` / leads | `{leadId,contactId,fromMembershipId,toMembershipId,assignmentVersion,tierLevel,source,reason:'deadline_expired',assignedAt,ackDeadlineAt}` | notification delivery + invalidation; audit/history before/after in originating transaction |
| `lead.reassigned` / leads | `{leadId,fromMembershipId,toMembershipId,assignmentVersion,ownershipMode,reason:'manual'|'absence'|'custody'}` | in-app/recovery invalidation; not counted as escalation |
| `lead.recovered` / leads | `{leadId,assignmentVersion,ownerMembershipId,recoveredAt,lateAcknowledgement:true}` | activity/recovery/dashboard; missed deadline remains in history |
| `lead.closed` / leads | `{leadId,ownerMembershipId,reason}` | capacity/recovery/dashboard invalidation; audit |
| `employee.availability_changed` / leads | `{membershipId,from:Availability,to:Availability}` | eligible-custody allocation/invalidation; unacknowledged absence transfer atomic before event |
| `message.received` / messaging | `{messageId,conversationId,contactId,leadId:Id|null}` | customer/dashboard invalidation; verified inbox effects already deduped |
| `message.sent` / messaging | `{messageId,conversationId,providerMessageRef,state:'sent'|'delivered'}` | activity/invalidation; sent fact, not enqueue, can qualify recorded action |
| `message.failed` / messaging | `{messageId,conversationId,errorCode,retryable:boolean}` | retry UI/admin history; no message body in event |
| `payment.confirmed` / payments | `{paymentRequestId,opportunityId,contactId,providerPaymentRef,money:Money,confirmedAt}` | dashboard/activity invalidation; ledger uniqueness already enforced |
| `payment.refunded` / payments | `{paymentRequestId,opportunityId,providerRefundRef,money:Money,confirmedAt}` | collected-revenue invalidation; immutable refund fact |
| `appointment.created` / calendar | `{appointmentId,contactId,opportunityId:Id|null,employeeMembershipId,startsAt,endsAt,timezone}` | activity/dashboard; emitted only after provider confirms |
| `appointment.rescheduled` / calendar | `{appointmentId,oldStartsAt,oldEndsAt,startsAt,endsAt,timezone}` | activity/dashboard; confirmed remote update |
| `appointment.cancelled` / calendar | `{appointmentId,cancelledAt}` | activity/dashboard; idempotent confirmed cancellation |
| `integration.connection_changed` / integrations | `{connectionId,provider,fromStatus,toStatus}` | admin status/invalidation; audit contains no credentials |
| `integration.event_failed` / integrations | `{connectionId,integrationEventId,errorCode,retryable:boolean}` | admin failure history; failure isolated by provider |
| `notification.delivery_changed` / notifications | `{deliveryId,leadId,recipientMembershipId,state:'sent'|'failed'|'unknown',errorCode:string|null}` | authorized delivery status; no token/chat ID/body |

## Jobs and ephemeral signals

Job kinds: `integration.inbox.process`, `messaging.send`, `payments.checkout.create`,
`calendar.event.sync`, `notifications.telegram.send`, `domain.consume`,
`realtime.invalidate`, `export.generate`. Payload includes referenced IDs, not duplicate
business objects or secrets. DB deadline transitions are a separate cron command, not
one fragile browser timeout per lead. Attempt/lease details are in the database contract.

Client signal schema: `{kind:'invalidate',domain:string,revision:string}` on private
`workspace:<workspaceId>:member:<membershipId>` channels. Server derives recipients;
client cannot publish domain facts. No record name, money, message text, credential or
raw event is broadcast. Membership is checked at join and every authoritative refetch;
permission revocation cannot expose old detailed event payloads. On reconnect, always
refetch; signals are not durable business history.
