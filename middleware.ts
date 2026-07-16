import { NextRequest, NextResponse } from 'next/server'

// Runs on the edge runtime, which can't reach Prisma — so this file cannot
// validate a session, and is NOT the authorisation boundary. It is an outer
// layer only:
//
//   /api/seed  — refused outright in production (the handler guards itself too).
//   /admin     — bounces visitors with no session cookie, so the common
//                logged-out case doesn't render a page to be told "no".
//
// The real admin gate is in src/app/admin/page.tsx: it resolves the session
// against the database and checks the account against ADMIN_EMAILS before
// touching any data. A forged or expired cookie gets past the check below and
// is then rejected there.
//
// If you add an admin API route, authorise it IN THE ROUTE. Do not rely on this
// file — a cookie being present proves nothing, and the matcher below wouldn't
// cover the route anyway.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/api/seed' && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
