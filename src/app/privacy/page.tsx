import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Runsemble',
  description: 'How Runsemble collects, uses, and protects your data.',
}

// Static legal page — reachable without an account (Google Play + GDPR require
// a public privacy policy URL). This is the Article 13 notice: it names every
// processor, the legal basis for each purpose, retention, transfers, and how to
// complain. Kept honest and specific to what the app actually does. The version
// string below is tied to lib/consent.ts CURRENT_POLICY_VERSION — bump both
// together when the substance changes.
export default function PrivacyPolicy() {
  const updated = '20 July 2026'
  const version = '2026-07-20'
  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-10">
      <article className="max-w-2xl mx-auto">
        <a href="/" className="text-sm text-primary hover:underline underline-offset-4">← Back to Runsemble</a>
        <h1 className="text-3xl font-extrabold tracking-tight mt-4 mb-1">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {updated} · Version {version}</p>

        <div className="space-y-6 text-sm leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_table]:w-full [&_table]:text-xs [&_td]:py-1 [&_td]:pr-3 [&_td]:align-top [&_th]:text-left [&_th]:py-1 [&_th]:pr-3 [&_strong]:text-foreground">
          <p>
            Runsemble (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a social running app that helps people find
            runners nearby, join group runs, and track their runs. Because the app shares location and helps
            people meet in person, we take privacy seriously and explain here exactly what we collect, why,
            who we share it with, and the control you have. Questions or requests? Email{' '}
            <a href="mailto:arianbehrami2002@hotmail.com" className="text-primary hover:underline">arianbehrami2002@hotmail.com</a>.
          </p>

          <h2>Who is responsible</h2>
          <p>
            The data controller for Runsemble is Arian Behrami, based in Antwerp, Belgium. You can reach us at
            the email above for any question about your data or to exercise the rights described below.
          </p>

          <h2>What we collect and why</h2>
          <p>We only collect what a purpose needs. The legal basis for each purpose is shown in the last column.</p>
          <table>
            <thead>
              <tr><th>Data</th><th>Why</th><th>Legal basis</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>Name, email, hashed password</strong></td><td>Create and secure your account</td><td>Contract</td></tr>
              <tr><td><strong>Age confirmation</strong> (at sign-up)</td><td>Make sure you are old enough to use the service</td><td>Legal obligation</td></tr>
              <tr><td><strong>Profile</strong> — avatar, bio, city, pace, schedule, optional gender</td><td>Show your profile; gender only to offer women-only runs if you choose</td><td>Contract / consent</td></tr>
              <tr><td><strong>Approximate location</strong> (while you&rsquo;re &ldquo;available&rdquo;)</td><td>Show you nearby runners and appear to them</td><td>Consent</td></tr>
              <tr><td><strong>Run GPS routes</strong>, distance, duration, pace</td><td>Record and let you review your own runs</td><td>Contract</td></tr>
              <tr><td><strong>Safe zones</strong> you define</td><td>Hide your location around places like home</td><td>Consent</td></tr>
              <tr><td><strong>Social data</strong> — posts, messages, buddies, groups, hotspots</td><td>The social features you use</td><td>Contract</td></tr>
              <tr><td><strong>Reports &amp; blocks</strong></td><td>Keep the community safe</td><td>Legitimate interests / legal obligation</td></tr>
              <tr><td><strong>Device push token</strong></td><td>Send notifications you asked for</td><td>Consent</td></tr>
              <tr><td><strong>Usage analytics</strong> (no location, no message content)</td><td>Understand and improve the app</td><td>Consent — off unless you opt in</td></tr>
              <tr><td><strong>Error reports</strong></td><td>Find and fix crashes</td><td>Legitimate interests</td></tr>
            </tbody>
          </table>

          <h2>Background location</h2>
          <p>
            When you start tracking a run, Runsemble collects location <strong>even when the app is in the
            background or the screen is off</strong>, so your route keeps recording while you run. This happens
            <strong> only</strong> during a run you started, and stops when you end it. We never track your
            location in the background at any other time.
          </p>

          <h2>How we protect your location</h2>
          <p>Location is the most sensitive thing we hold, so it gets specific protections:</p>
          <ul>
            <li>Other users only ever see an <strong>approximate</strong> position, reduced to a ~200&nbsp;m grid on our server — never your exact coordinates.</li>
            <li><strong>Safe zones</strong> hide you entirely around places you choose.</li>
            <li>By default your location is <strong>not</strong> shared — only when you turn availability on.</li>
            <li>When you share a run to the feed, its route has the start and end <strong>blinded</strong> so it can&rsquo;t reveal where you live.</li>
            <li>We never put location into analytics, and we never sell it or use it for advertising.</li>
          </ul>

          <h2>Who processes your data</h2>
          <p>We use a small set of vetted providers (processors) to run the service. Each handles data only on our instructions.</p>
          <table>
            <thead><tr><th>Provider</th><th>Purpose</th><th>Where</th></tr></thead>
            <tbody>
              <tr><td><strong>Vercel</strong></td><td>App hosting &amp; image storage</td><td>EU (Frankfurt)</td></tr>
              <tr><td><strong>Neon</strong></td><td>Database</td><td>EU (Frankfurt)</td></tr>
              <tr><td><strong>Google Firebase</strong></td><td>Push notification delivery</td><td>USA (with safeguards)</td></tr>
              <tr><td><strong>PostHog</strong></td><td>Usage analytics (if you opt in)</td><td>EU</td></tr>
              <tr><td><strong>Sentry</strong></td><td>Error tracking</td><td>EU (Germany)</td></tr>
              <tr><td><strong>Resend</strong></td><td>Account emails</td><td>Check region / safeguards</td></tr>
              <tr><td><strong>OpenStreetMap &amp; CARTO</strong></td><td>Map imagery</td><td>EU / global</td></tr>
              <tr><td><strong>Nominatim (OpenStreetMap)</strong></td><td>Place lookup</td><td>EU</td></tr>
            </tbody>
          </table>
          <p>
            Where a provider is outside the EEA (for example Google), the transfer is covered by appropriate
            safeguards such as the EU Standard Contractual Clauses.
          </p>

          <h2>How long we keep it</h2>
          <ul>
            <li><strong>Account &amp; profile:</strong> while your account exists.</li>
            <li><strong>Exact run routes:</strong> the precise GPS trace of a run is automatically <strong>coarsened</strong> after 90 days — the start and end are blinded and the track is thinned — so old routes can&rsquo;t reveal where you live, while your run stats stay intact.</li>
            <li><strong>Shared location:</strong> your live position isn&rsquo;t stored as history; it&rsquo;s just your current point.</li>
            <li><strong>Everything:</strong> deleted when you delete your account.</li>
          </ul>

          <h2>Your rights</h2>
          <p>Under the GDPR you can, at any time — mostly right from your profile:</p>
          <ul>
            <li><strong>Access &amp; export</strong> a machine-readable copy of your data.</li>
            <li><strong>Delete</strong> your account and all associated data permanently.</li>
            <li><strong>Correct</strong> your profile, or ask us to fix anything else.</li>
            <li><strong>Withdraw consent</strong> — turn off location sharing or analytics whenever you like, without affecting the rest of the service.</li>
            <li><strong>Object or restrict</strong> — email us and we&rsquo;ll address it.</li>
          </ul>
          <p>
            We aim to answer requests within one month. If you believe we&rsquo;ve mishandled your data, you can
            complain to the Belgian Data Protection Authority (Gegevensbeschermingsautoriteit /
            Autorité de protection des données),{' '}
            <a href="https://www.dataprotectionauthority.be" className="text-primary hover:underline" rel="noopener noreferrer" target="_blank">dataprotectionauthority.be</a>.
          </p>

          <h2>Age</h2>
          <p>
            Runsemble is a service that shares location and helps people meet, so we ask you to confirm your
            age at sign-up and do not knowingly allow anyone below the age required for consent in your country
            to create an account. If you believe a child has signed up, contact us and we&rsquo;ll remove the account.
          </p>

          <h2>Security</h2>
          <p>
            Data is stored in the EU. Passwords are hashed, session tokens are stored only as a hash, cookies
            are httpOnly, and all traffic is encrypted over HTTPS.
          </p>

          <h2>Changes</h2>
          <p>
            If we change this policy in a way that affects what we collect or who receives it, we&rsquo;ll update
            the version and date above and ask you to review it. We keep a record of which version you accepted.
          </p>

          <h2>Contact</h2>
          <p>
            Runsemble · Arian Behrami, Antwerp, Belgium ·{' '}
            <a href="mailto:arianbehrami2002@hotmail.com" className="text-primary hover:underline">arianbehrami2002@hotmail.com</a>
          </p>
        </div>
      </article>
    </main>
  )
}
