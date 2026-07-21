# WebSocket reference — NOT part of this app

These two files are a **reference sketch, not shipped code**. Nothing imports
them, they are excluded from the build, and they cannot run on Runsemble's
current stack.

`server.ts` is a long-lived socket.io process fronted by Caddy. Runsemble runs on
Vercel serverless functions, where there is no persistent process to hold a
socket open: every open connection would pin a function invocation for its whole
life, and with no pub/sub behind it each handler would end up polling the
database anyway — polling with extra steps, and a bill.

That is why the app deliberately uses **HTTP polling plus push-driven cache
invalidation** instead (see `src/hooks/usePushNotifications.ts`, which treats an
arriving push as the event that makes data stale, and `src/lib/use-visible-poll.ts`,
which stops polling for a screen nobody is looking at).

Keep these files only as a starting point if Runsemble ever moves the real-time
layer onto a managed provider (Ably/Pusher) or its own long-lived process. If
that day comes, revisit the CORS allowlist and the hardcoded Caddy path first.
