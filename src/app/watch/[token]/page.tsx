import type { Metadata } from 'next'
import { WatchClient } from './watch-client'

// A live-location URL must never be indexable or cached by a crawler — the link
// is meant for one person the runner chose, not for the open web. The API that
// serves the position sets the same robots directive as a header; this sets it
// in the page metadata so the HTML document carries it too.
export const metadata: Metadata = {
  title: 'Live run — Runsemble',
  robots: { index: false, follow: false, nocache: true },
}

// No data fetching here on purpose: the page is a thin shell that must not be
// cached, and the position is loaded client-side by WatchClient so it stays
// live. In Next 16 params is a Promise.
export default async function WatchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <WatchClient token={token} />
}
