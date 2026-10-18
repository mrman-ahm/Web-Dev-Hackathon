# Technical references reviewed for Foundation B

Reviewed on 2026-10-18. These inform the proposed design, not proof that implementation
works. Recheck provider/tool behavior when installing exact versions.

- [Supabase changelog](https://supabase.com/changelog.md): reviewed recent relevant breaking changes.
- [Cron](https://supabase.com/docs/guides/cron): second-level SQL/function/HTTP schedules; supports the proposed five-second cadence.
- [SSR client/auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs): cookie refresh/Proxy, verified claims and no shared caching of sessions.
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): private channel RLS and join-time authorization.
- [Realtime schema restrictions](https://supabase.com/changelog/realtime-schema-locked-down-against-modification): no schema-object mutations; policies on realtime.messages remain supported.
- [Extension version behavior](https://supabase.com/changelog/extension-version-pinning-ignored): record actual installed versions rather than relying on CREATE EXTENSION VERSION.
- [Twilio webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security): exact external URL/original parameters and official SDK signature validation.
- [Stripe webhooks](https://docs.stripe.com/webhooks): original bytes/signatures, duplicates/order and HTTPS; stable supported API version selected during implementation.
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server): server token exchange/offline refresh/consent.
- [Google free/busy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query): busy intervals and scopes.
- [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage): Bot sendMessage, destination IDs and provider errors.
- [PostgreSQL btree_gist](https://www.postgresql.org/docs/current/btree-gist.html): GiST uuid and not-equal support for other-appointment overlap exclusion; exact migration DDL remains to be tested.
