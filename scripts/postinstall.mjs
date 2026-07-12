// Applies the native (Capacitor plugin) patches via patch-package — but ONLY
// where they matter. The Vercel deploy builds the Next.js *web* app, which never
// touches the patched native Android/iOS files, so running patch-package there
// just risks breaking an unrelated production deploy if a hunk ever goes stale.
// The native builds (local Android Studio, Codemagic iOS) DO need it, and there
// we let a failure surface loudly instead of shipping without the fix.
import { execSync } from 'node:child_process'

if (process.env.VERCEL) {
  console.log('postinstall: on Vercel (web build) — skipping native patch-package.')
  process.exit(0)
}

try {
  execSync('npx --no-install patch-package', { stdio: 'inherit' })
} catch {
  console.error('postinstall: patch-package failed to apply the native patches.')
  process.exit(1)
}
