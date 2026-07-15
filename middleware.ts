import { NextRequest, NextResponse } from 'next/server'

// Block the seed endpoint in production unconditionally,
// and enforce session auth on the /admin page.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /api/seed must never run in production regardless of any other guard
  if (pathname === '/api/seed' && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Admin panel requires an active session cookie
  if (pathname.startsWith('/admin')) {
    const session = request.cookies.get('rs_session')
    if (!session) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/seed'],
}
