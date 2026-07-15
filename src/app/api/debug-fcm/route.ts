// TEMPORARY DEBUG ENDPOINT — delete after fixing FCM
import { NextResponse } from 'next/server'

export async function GET() {
  const raw = process.env.FCM_PRIVATE_KEY ?? ''
  const replaced = raw.replace(/\\n/g, '\n')
  return NextResponse.json({
    raw_length: raw.length,
    starts_with: raw.slice(0, 40),
    ends_with: raw.slice(-40),
    contains_literal_backslash_n: raw.includes('\\n'),
    contains_real_newlines: raw.includes('\n'),
    replaced_length: replaced.length,
    begins_correctly: replaced.startsWith('-----BEGIN PRIVATE KEY-----'),
    ends_correctly: replaced.trimEnd().endsWith('-----END PRIVATE KEY-----'),
  })
}
