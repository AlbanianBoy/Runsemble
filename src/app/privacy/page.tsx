import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Runsemble',
  description: 'How Runsemble collects, uses, and protects your data.',
}

// Static legal page — reachable without an account (Google Play + GDPR require
// a public privacy policy URL). Kept honest and specific to what the app does.
export default function PrivacyPolicy() {
  const updated = '8 July 2026'
  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-10">
      <article className="max-w-2xl mx-auto">
        <a href="/" className="text-sm text-primary hover:underline underline-offset-4">← Back to Runsemble</a>
        <h1 className="text-3xl font-extrabold tracking-tight mt-4 mb-1">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {updated}</p>

        <div className="space-y-6 text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_strong]:text-foreground">
          <p>
            Runsemble (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a social running app that helps people
            find runners nearby, join group runs, and track their runs. This policy explains what
            data we collect, why, and the control you have over it. Questions? Email{' '}
            <a href="mailto:arianbehrami2002@hotmail.com" className="text-primary hover:underline">arianbehrami2002@hotmail.com</a>.
          </p>

          <h2>Data we collect</h2>
          <ul>
            <li><strong>Account:</strong> your name and email address. Your password is stored only as a salted cryptographic hash — we never store or see the password itself.</li>
            <li><strong>Profile:</strong> optional details you add — bio, city, preferred pace, schedule, and gender (used only to offer women-only runs if you choose).</li>
            <li><strong>Location:</strong> your approximate location, to show you runs and runners nearby and to centre your map.</li>
            <li><strong>Run data:</strong> when you track a run, we record the route (GPS points), distance, duration, and pace so you can review and share it.</li>
          </ul>

          <h2>Background location</h2>
          <p>
            When you start tracking a run, Runsemble collects location data <strong>even when the app
            is in the background or the screen is off</strong>, so your route keeps recording while you
            run. Background location is used <strong>only</strong> during an active run that you start,
            and stops when you end the run. We never track your location in the background at any other time.
          </p>

          <h2>How we use your data</h2>
          <ul>
            <li>To run the core features: nearby runners, group runs, run tracking, feed, and leaderboards.</li>
            <li>To send you account emails (verification and password reset).</li>
            <li>To keep the service safe (e.g. honouring blocks between users).</li>
          </ul>
          <p>We do <strong>not</strong> sell your data, and we do not use it for advertising.</p>

          <h2>What other users can see</h2>
          <p>
            Other users can see your public profile (name, avatar, bio, pace, stats) and, if you make
            yourself visible, an <strong>approximate</strong> location snapped to a ~200&nbsp;m privacy
            grid — never your exact position. Your email and precise coordinates are never shared with
            other users. You can hide your location any time in your profile.
          </p>

          <h2>Who processes your data</h2>
          <p>We use a small set of trusted providers to run the service:</p>
          <ul>
            <li><strong>Neon</strong> — our database (hosted in the EU).</li>
            <li><strong>Vercel</strong> — application hosting.</li>
            <li><strong>Resend</strong> — sending transactional emails (EU region).</li>
          </ul>

          <h2>Storage &amp; security</h2>
          <p>
            Your data is stored in the EU. Passwords are hashed, sessions use secure httpOnly cookies,
            and all traffic is encrypted over HTTPS.
          </p>

          <h2>Your rights</h2>
          <p>You are in control of your data. From your profile you can, at any time:</p>
          <ul>
            <li><strong>Export</strong> a copy of your data.</li>
            <li><strong>Delete</strong> your account and all associated data permanently.</li>
          </ul>
          <p>You may also contact us to access or correct your information.</p>

          <h2>Data retention</h2>
          <p>We keep your data while your account is active. When you delete your account, your personal data is removed.</p>

          <h2>Children</h2>
          <p>Runsemble is not intended for anyone under 16. We do not knowingly collect data from children.</p>

          <h2>Changes</h2>
          <p>If we change this policy, we&rsquo;ll update the date above. Continued use after a change means you accept the updated policy.</p>

          <h2>Contact</h2>
          <p>
            Runsemble · <a href="mailto:arianbehrami2002@hotmail.com" className="text-primary hover:underline">arianbehrami2002@hotmail.com</a>
          </p>
        </div>
      </article>
    </main>
  )
}
