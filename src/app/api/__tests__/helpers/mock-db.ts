import { Prisma } from '@prisma/client'
import { vi } from 'vitest'
import type { TxClient } from '@/lib/outbox'

// ─── A Prisma stand-in that lies about exactly nothing ────────────────────────
// The models come from Prisma.ModelName — the real generated list — so asking for
// a model the schema doesn't have yields `undefined`, and calling a method on it
// throws a TypeError, precisely as it does in production.
//
// That fidelity is the whole point. A mock that conjures up any model on demand
// would happily answer db.groupChatMessage.findMany() and pass a green test for
// the GDPR export route, which was throwing on every real request because a
// migration had removed that model. A convenient mock would have hidden the one
// bug worth catching.

const MODELS = new Set(
  Object.values(Prisma.ModelName).map((m) => m[0].toLowerCase() + m.slice(1))
)

type Result = unknown
/** Per-call overrides, keyed `model.method` — e.g. `{ 'user.findUnique': () => ({ id: 'u1' }) }`. */
export type DbOverrides = Record<string, (...args: unknown[]) => Result>

/**
 * Build a mock Prisma client.
 *
 * Unlisted methods resolve to a benign empty value, so a route under test only
 * has to declare the calls its assertion actually depends on.
 */
export function makeDb(overrides: DbOverrides = {}) {
  const calls: string[] = []

  const client = new Proxy({} as Record<string, unknown>, {
    get(_t, modelProp: string) {
      // Transaction/raw helpers hang off the client itself, not a model.
      if (modelProp === '$transaction') {
        return vi.fn(async (arg: unknown) =>
          typeof arg === 'function'
            ? (arg as (c: unknown) => unknown)(client)
            // The array form resolves every operation and hands back their
            // results. Returning the array of pending promises unchanged would
            // let `const [, session] = await db.$transaction([...])` bind a
            // Promise, and a test asserting on session.id would read undefined
            // while production read the row.
            : Promise.all(arg as unknown[])
        )
      }
      if (modelProp === '$queryRaw' || modelProp === '$queryRawUnsafe') {
        return vi.fn(async () => (overrides['$queryRaw']?.() as Result) ?? [])
      }
      if (modelProp === '$executeRaw' || modelProp === '$disconnect') return vi.fn(async () => 0)

      // The load-bearing line: not a real model → undefined, same as production.
      if (!MODELS.has(modelProp)) return undefined

      return new Proxy({} as Record<string, unknown>, {
        get(_t2, method: string) {
          const key = `${modelProp}.${method}`
          return vi.fn(async (...args: unknown[]) => {
            calls.push(key)
            if (overrides[key]) return overrides[key](...args)
            // Sensible empties: counts are numbers, finds are null/[], writes echo.
            if (method === 'count') return 0
            if (method.startsWith('findMany')) return []
            if (method === 'groupBy') return []
            if (method === 'deleteMany' || method === 'updateMany') return { count: 0 }
            if (method.startsWith('find')) return null
            return {}
          })
        },
      })
    },
  }) as unknown as TxClient

  return { db: client, calls }
}
