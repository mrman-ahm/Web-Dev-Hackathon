# Technical references reviewed for Foundation B

Reviewed on 2026-10-18. These inform the proposed design, not proof that implementation
works. Recheck provider/tool behavior when installing exact versions.

- [Supabase changelog](https://supabase.com/changelog.md): reviewed recent relevant breaking changes.
- [Cron](https://supabase.com/docs/guides/cron): second-level SQL/function/HTTP schedules; supports the proposed five-second cadence.
- [SSR client/auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs): cookie refresh/Proxy, verified claims and no shared caching of sessions.
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): private channel RLS and join-time authorization.
- [Realtime schema restrictions](https://supabase.com/changelog/realtime-schema-locked-down-against-modification): no schema-object mutations; policies on realtime.messages remain supported.
- [Extension version behavior](https://supabase.com/changelog/extension-version-pinning-ignored): record actual installed versions rather than relying on CREATE EXTENSION VERSION.
- [Textbee webhook security](https://textbee.dev/docs/webhooks): exact raw-body X-Signature HMAC-SHA256, per-subscription secrets and retry behavior.
- [Textbee webhook event shapes](https://textbee.dev/docs/webhooks/events): smsId/smsBatchId, receivedAt, UNKNOWN_STATE and provider status fields.
- [Textbee SMS sending](https://textbee.dev/docs/sending-sms/sending-sms): HTTP acceptance means queued/pending, not carrier delivery.
- [Safepay webhook types](https://safepay-docs.netlify.app/developers/webhooks/webhook-types/): merchant event names and payload fields, including payment.refunded.
- [Safepay webhook HMAC](https://safepay-docs.netlify.app/developers/webhooks/verify-hmac-signatures/): signature verification against original webhook bytes.
- [Safepay Express Checkout](https://safepay-docs.netlify.app/build-your-integration/express-checkout/?platform=web): tracker creation, passport token and hosted checkout URL flow.
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server): server token exchange/offline refresh/consent.
- [Google free/busy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query): busy intervals and scopes.
- [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage): Bot sendMessage, destination IDs and provider errors.
- [PostgreSQL btree_gist](https://www.postgresql.org/docs/current/btree-gist.html): GiST uuid and not-equal support for other-appointment overlap exclusion; exact migration DDL remains to be tested.
