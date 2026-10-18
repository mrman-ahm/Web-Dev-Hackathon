# Companies and contacts

The first CRM records slice stores companies and contacts in the workspace database.
It serves the workspace CRM screen and `/api/v1/workspaces/:workspaceId/companies`
and `/contacts` endpoints through the same server-only services. Lists use bounded,
workspace-bound cursors. Every edit and archive sends the current `expectedVersion`;
stale changes return a safe conflict.

Contacts are assigned to the authenticated membership at creation. Users without
`crm.records.view_all` see only their own contacts. A company is visible to a scoped
user when they created it or it appears through one of their visible contacts; that
projection does not expose sibling contacts. Company references use a composite
workspace foreign key. Phone inputs accept explicit international notation and are
stored as E.164; active workspace phone numbers are unique. Archiving is soft and a
company with active contacts must be archived after those contacts.

Direct Data API table access is revoked. The authenticated user's JWT calls narrowly
granted database functions, which recheck the active session, workspace membership,
permission and ownership and append audit facts in the same transaction. Audit payloads
contain versions and changed field names, not phone or email values.

The `customFields` DTO field is empty in this slice because custom fields are a separate
backlog task. Opportunity relationships, record import/assignment, merge flows and
hard deletion are also outside this slice. The browser test exercises real local Auth,
record create/edit/reload/archive. App process and database stop/start durability require
the broader Q6 acceptance run.
