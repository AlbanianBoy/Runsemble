import type { CapacitorConfig } from '@capacitor/cli';

// Runsemble is a Next.js *server* app, so the native shell loads the live site
// directly (server.url) rather than bundling a static export. This keeps the
// session cookie, relative /api calls, and every feature working unchanged —
// the native layer just adds capabilities the browser can't (background GPS,
// push) via Capacitor plugins the web code calls when running natively.
//
// In a release build this resolves to https://runsemble.net. For a dev or
// staging native build, set CAP_SERVER_URL in the shell before running
// `npx cap sync` — e.g. CAP_SERVER_URL=https://staging.runsemble.net npx cap sync.
const config: CapacitorConfig = {
  appId: 'net.runsemble.app',
  appName: 'Runsemble',
  webDir: 'public', // fallback only; server.url is what actually loads
  server: {
    url: process.env.CAP_SERVER_URL ?? 'https://runsemble.net',
    cleartext: false,
    errorPath: 'offline.html', // shown when runsemble.net is unreachable
  },
  backgroundColor: '#faf8f6',
  android: {
    backgroundColor: '#faf8f6',
  },
};

export default config;
