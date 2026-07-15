// ─── FCM V1 Push Sender (server-only) ─────────────────────────────────────────────────────
// Uses the Firebase Cloud Messaging HTTP V1 API with a service-account JWT.
// All sends are best-effort — a push failure must never break the action that
// triggered it.

const FCM_PROJECT_ID = 'runsemble-1ec42'
const FCM_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@runsemble-1ec42.iam.gserviceaccount.com'
const FCM_PRIVATE_KEY_ID = '9f0f51ff9e0c3568a385e3fcd63c781e51c7a37d'

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
  // urn:ietf:params:oauth:grant-type:jwt-bearer — note: oauth NOT oauth2
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
}

export async function sendPush(payload: PushPayload): Promise<void> {
  if (!getPrivateKey()) return
  try {
    const accessToken = await getAccessToken()
    const res = await fetch(FCM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: payload.token,
          notification: {
            title: payload.title,
            body: payload.body ?? '',
          },
        },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('FCM send failed:', res.status, err)
    } else {
      console.log('FCM push sent successfully')
    }
  } catch (e) {
    console.error('FCM send error (non-fatal):', e)
  }
}
