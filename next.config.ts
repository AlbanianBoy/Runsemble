import type { NextConfig } from "next";

// ─── Security headers ─────────────────────────────────────────────────────────
// Defence in depth, honestly labelled.
//
// script-src carries 'unsafe-inline' because Next's hydration inlines a script
// per page, and the alternative — a per-request nonce — needs middleware on every
// route, which is real latency on every request for a threat this app barely has:
// it renders no user-supplied HTML anywhere (no dangerouslySetInnerHTML outside a
// shadcn chart's own CSS, no markdown renderer, React escapes everything else).
// So this policy is not the thing standing between you and XSS. Not rendering
// user HTML is.
//
// The directives that DO bite here, and cost nothing:
//   frame-ancestors 'none'  — nobody can iframe the app and clickjack a tap on
//                             "go available", which broadcasts your location.
//   connect-src             — an injected script can't quietly POST your GPS to
//                             an attacker's host; it can only reach us and the
//                             geocoder.
//   base-uri / object-src   — kills <base> hijacking and plugin embedding.
// React and Turbopack use eval() in development for HMR and callstack
// reconstruction; React never evals in production. So dev gets 'unsafe-eval' and
// production doesn't — without the split, `bun run dev` is a wall of CSP errors
// and nobody would keep the policy.
const devEval = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${devEval}`,
  // Tailwind and Radix set inline styles at runtime.
  "style-src 'self' 'unsafe-inline'",
  // Map tiles (CARTO + OSM), Vercel Blob photos, blob: for canvas compression,
  // and data: for posts written before Blob existed — those rows still render.
  "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://*.public.blob.vercel-storage.com",
  "font-src 'self' data:",
  // Same-origin API + Nominatim for geocoding a run's location. Nothing else.
  // ws: is the dev HMR socket; it is not present in production.
  `connect-src 'self' https://nominatim.openstreetmap.org${
    process.env.NODE_ENV === 'production' ? '' : ' ws: http://localhost:*'
  }`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Belt and braces with frame-ancestors, for anything that predates CSP.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't leak the page someone came from to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Geolocation is the product; everything else stays off. Note geolocation must
  // stay 'self' or the map and run tracker stop working.
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
  },
]

const nextConfig: NextConfig = {
  output: "standalone",
  // No `typescript.ignoreBuildErrors` here on purpose. It used to be on, and it
  // hid a real one: the GDPR export route kept calling a Prisma model that a
  // migration had deleted, so it threw on every request while the build stayed
  // green. The tree typechecks clean — keep it that way.
  reactStrictMode: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
};

export default nextConfig;
