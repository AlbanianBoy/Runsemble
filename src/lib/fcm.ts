// ─── FCM V1 Push Sender (server-only) ─────────────────────────────────────────────────────
// Uses the Firebase Cloud Messaging HTTP V1 API with a service-account JWT.
// All sends are best-effort — a push failure must never break the action that
// triggered it.

// The service-account identity. The private key has always come from the
// environment; these three did not, which meant rotating a leaked or expired
// service account required editing this file and shipping a deploy — during an
// incident, which is the worst moment to need one. It also made a second
// Firebase project (a staging one) impossible without a code change.
//
// Env first, with the current production values as the fallback so nothing
// breaks for an instance that sets none of them. Rotating means setting all
// three: a new key with an old key id fails to authenticate, and the mismatch
// surfaces as a generic 401 from Google that says nothing about which half is
// stale. /api/admin/diagnostics reports which source is in use.
const FCM_PROJECT_ID = process.env.FCM_PROJECT_ID ?? 'runsemble-1ec42'
const FCM_CLIENT_EMAIL =
  process.env.FCM_CLIENT_EMAIL ?? 'firebase-adminsdk-fbsvc@runsemble-1ec42.iam.gserviceaccount.com'
const FCM_PRIVATE_KEY_ID =
  process.env.FCM_PRIVATE_KEY_ID ?? '9f0f51ff9e0c3568a385e3fcd63c781e51c7a37d'

/** True when the identity comes from the environment rather than the built-in fallback. */
export function fcmIdentityFromEnv(): boolean {
  return Boolean(
    process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY_ID
  )
}

const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

function getPrivateKey(): string {
  return (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
}

// ── JWT helpers ──────────────────────────────────────────────────────────────────
function base64url(data: string): string {
  return Buffer.from(data).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function makeJwt(): Promise<string> {
  const privateKey = getPrivateKey()
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: FCM_PRIVATE_KEY_ID }))
  const payload = base64url(JSON.stringify({
    iss: FCM_CLIENT_EMAIL,
    sub: FCM_CLIENT_EMAIL,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
    scope: SCOPE,
  }))
  const sigInput = `${header}.${payload}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput))
  return `${sigInput}.${Buffer.from(sig).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}`
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// ── OAuth2 access token ───────────────────────────────────────────────────────────────
let cachedToken: { token: string; exp: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() / 1000 + 60) return cachedToken.token
  const jwt = await makeJwt()
  const grantType = encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')
  const body = `grant_type=${grantType}&assertion=${jwt}`
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OAuth2 token exchange failed: ${res.status} ${err}`)
  }
  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, exp: Math.floor(Date.now() / 1000) + data.expires_in }
  return cachedToken.token
}

// ── Public API ──────────────────────────────────────────────────────────────────
export interface PushPayload {
  token: string
  title: string
  body?: string | null
  /**
   * What actually happened — 'like', 'badge', 'group_message', and so on. The
   * client routes a tap on this and refreshes the right data on arrival, so a
   * push that misreports itself sends the user to the wrong screen.
   */
  type?: string
  /** The thing the notification is about (post id, run id, sender id). */
  entityId?: string | null
  // Deep-link data for DMs specifically, so the client can open the right sheet.
  senderId?: string
  senderName?: string
}

/**
 * What happened to one send.
 *
 * `tokenDead` is the interesting one: FCM answers 404 UNREGISTERED (app
 * uninstalled, token rotated) or 400 INVALID_ARGUMENT (malformed) for a token
 * that will never work again. Callers use it to stop trying — otherwise the
 * device table fills with tokens from uninstalled apps and every notification
 * pays to retry them for ever.
 */
export type PushResult = { ok: boolean; tokenDead: boolean }

export async function sendPush(payload: PushPayload): Promise<PushResult> {
  if (!getPrivateKey()) return { ok: false, tokenDead: false }
  try {
    const accessToken = await getAccessToken()

    // FCM data fields must all be strings.
    // This used to be hardcoded to 'message', which made every push claim to be
    // a DM — a badge, a like and a hotspot reminder all arrived identically
    // labelled, so the client had nothing to route on.
    const data: Record<string, string> = { type: payload.type ?? 'message' }
    if (payload.entityId) data.entityId = payload.entityId
    if (payload.senderId) data.senderId = payload.senderId
    if (payload.senderName) data.senderName = payload.senderName

    const res = await fetch(FCM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: payload.token,
          // notification block shows the visible push banner
          notification: {
            title: payload.title,
            body: payload.body ?? '',
          },
          // data block is passed through to the app for deep-linking
          data,
        },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('FCM send failed:', res.status, err)
      // 404 UNREGISTERED = uninstalled or rotated. 400 INVALID_ARGUMENT with
      // this error code = malformed. Both are permanent for this token; every
      // other failure (401, 429, 5xx) is worth retrying later, so the token
      // stays enabled.
      const permanent =
        res.status === 404 ||
        (res.status === 400 && /UNREGISTERED|INVALID_ARGUMENT/i.test(err))
      return { ok: false, tokenDead: permanent }
    }
    return { ok: true, tokenDead: false }
  } catch (e) {
    // Network or auth trouble — not the token's fault, so leave it enabled.
    console.error('FCM send error (non-fatal):', e)
    return { ok: false, tokenDead: false }
  }
}
