# Runsemble

A social running app for Antwerp — *because together is better*.

Runsemble is a Next.js web app that also ships as a native Android and iOS app. The native
shells don't bundle a copy of the site; they load `runsemble.net` directly and add the things
a browser can't do — background GPS and push notifications — through Capacitor plugins.

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui, Framer Motion, Leaflet (maps) |
| State | Zustand (client state), TanStack Query (server cache) |
| Data | Prisma + PostgreSQL |
| Auth | Custom httpOnly cookie sessions backed by a DB table (`src/lib/auth.ts`) |
| Native | Capacitor 8 (Android + iOS) |
| Package manager | **bun** (`bun.lock` is the lockfile of record) |
| Hosting | Vercel (web) · Codemagic (iOS builds) |

## Local setup

You need [bun](https://bun.sh) and a PostgreSQL database.

```bash
bun install                 # also applies the GPS plugin patch (see "Patched GPS plugin")
cp .env.example .env        # then fill in DATABASE_URL at minimum
bunx prisma generate
bunx prisma migrate deploy  # or `bun run db:push` for a throwaway dev DB
bun run dev                 # http://localhost:3000
```

To populate a dev database with realistic data, `POST /api/seed`. It is POST-only and refuses
to run when `NODE_ENV=production` — it wipes the database before reseeding.

### Environment variables

`.env.example` is the source of truth. Only `DATABASE_URL` is required to boot. Notable
optional ones:

- `BLOB_READ_WRITE_TOKEN` — injected by Vercel when a Blob store is linked. When set, post
  photos are uploaded to Blob and only the URL is stored; when absent they fall back to
  inline base64 in Postgres (fine locally, but it grows the database).
- `EMAIL_SMTP_*` / `EMAIL_FROM` — verification codes and password resets.

`.env` and `.env.local` are gitignored and must stay that way.

## Scripts

| Command | Does |
| --- | --- |
| `bun run dev` | Dev server on :3000 |
| `bun run build` | `prisma generate` + `next build` (typechecks — see below) |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Vitest unit tests |
| `bun run db:push` | `prisma db push` — **dev only** |
| `bun run db:migrate` | `prisma migrate dev` |

## Deployment

**Pushing to `main` deploys production.** Vercel builds from `main`, and the native apps load
the live site — so a web deploy reaches every Android and iOS user as soon as they reopen the
app. There is no separate mobile release for JS changes.

Native changes (Java, Swift, Gradle, `AndroidManifest.xml`) are the exception: they need a
rebuild and reinstall.

- **Android** — Android Studio → Sync → Run.
- **iOS** — Codemagic (`codemagic.yaml`, `ios-release` workflow). See
  `docs/ios-release-runbook.md`.

Production database migrations are gated on a human. Don't run `prisma db push` against prod.

## Architecture notes

### GPS tracking

Tracking is the hard part of this app and has three tiers, in order of preference:

1. **RunRecorder** (native, Android + iOS) — a foreground service that owns the run and
   appends every fix to a JSONL file on disk. The JS layer is a *reader*: it polls the file by
   line index. This is what makes a run survive the WebView being frozen or the app being
   killed.
2. **Community plugin buffer** — `@capacitor-community/background-geolocation` buffers fixes
   natively and JS drains them on resume. Used when RunRecorder isn't available.
3. **`navigator.geolocation.watchPosition`** — web fallback, foreground only.

Distance uses Haversine with an accuracy gate, a jitter floor, and a speed-scaled jump cap
(`src/lib/run-math.ts`). The elapsed timer is wall-clock based, so a suspended background tick
never under-counts.

**Android/Samsung caveat:** aggressive OEM battery management freezes the app process with the
screen off. Adding Runsemble to Samsung's *Never sleeping apps* is the setting that fixes it.

### Patched GPS plugin

`@capacitor-community/background-geolocation` is patched via **patch-package**
(`patches/`, applied by `scripts/postinstall.mjs`). The patch is load-bearing — it's what
makes screen-off tracking work. Don't delete it, and after editing the plugin under
`node_modules`, regenerate the patch. `scripts/postinstall.mjs` deliberately skips
patch-package on Vercel.

### Typechecking

`next.config.ts` does **not** set `typescript.ignoreBuildErrors`. It used to, and it hid a
route calling a Prisma model that a migration had deleted — green build, 500 at runtime. The
tree typechecks clean; keep it that way.

## Testing

`bun run test` runs Vitest against the pure logic in `src/lib` (XP, geo, run math, offline
sync queue, ranks, rate limiting, image storage). API routes have no integration tests yet.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test, and build on every push and PR.
It needs no secrets.
