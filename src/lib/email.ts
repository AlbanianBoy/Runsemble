// ─── Transactional email (Resend) ────────────────────────────────────────────
// Thin wrapper over Resend's REST API — no SDK dependency, just fetch, so it
// works in any server route. Sends are best-effort: callers should not fail
// their request if an email can't go out (log and move on).
//
// NOTE: EMAIL_FROM must use a domain verified in your Resend dashboard. The
// default `onboarding@resend.dev` only delivers to the Resend account owner —
// fine for testing, but verify a real domain before emailing pilot users.

const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Runsemble <onboarding@resend.dev>'

interface SendResult {
  ok: boolean
  error?: string
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
}): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email to', opts.to)
    return { ok: false, error: 'Email is not configured' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[email] Resend send failed', res.status, body)
      return { ok: false, error: `Email failed (${res.status})` }
    }
    return { ok: true }
  } catch (err) {
    console.error('[email] Resend send error', err)
    return { ok: false, error: 'Email service error' }
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────
// One shared shell so verification and reset emails look consistent.
function codeEmailHtml(opts: {
  heading: string
  intro: string
  code: string
  footer: string
}): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1b1b19">
    <h1 style="font-size:22px;font-weight:800;color:#f97316;margin:0 0 4px">Runsemble</h1>
    <h2 style="font-size:18px;font-weight:700;margin:16px 0 8px">${opts.heading}</h2>
    <p style="font-size:14px;line-height:1.6;color:#4b4b46;margin:0 0 20px">${opts.intro}</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:10px;text-align:center;background:#fff7ed;border:1px solid #f59e0b;border-radius:12px;padding:18px 0;color:#1b1b19">${opts.code}</div>
    <p style="font-size:12px;line-height:1.6;color:#8a8a82;margin:20px 0 0">${opts.footer}</p>
  </div>`
}

export function sendVerificationEmail(to: string, code: string): Promise<SendResult> {
  return sendEmail({
    to,
    subject: 'Verify your email · Runsemble',
    html: codeEmailHtml({
      heading: 'Confirm your email',
      intro: 'Enter this 6-digit code in the app to verify your email address:',
      code,
      footer: "This code expires in 15 minutes. If you didn't create a Runsemble account, you can ignore this email.",
    }),
  })
}

export function sendPasswordResetEmail(to: string, code: string): Promise<SendResult> {
  return sendEmail({
    to,
    subject: 'Reset your password · Runsemble',
    html: codeEmailHtml({
      heading: 'Reset your password',
      intro: 'Enter this 6-digit code in the app to set a new password:',
      code,
      footer: "This code expires in 15 minutes. If you didn't request a password reset, you can safely ignore this email — your password won't change.",
    }),
  })
}
