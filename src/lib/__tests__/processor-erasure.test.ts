import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eraseFromProcessors, processorErasureConfigured } from '@/lib/processor-erasure'

// Art. 17(2): deleting the account has to reach anyone else holding data
// identified to the person. PostHog is the one that does — analytics.ts calls
// posthog.identify(user.id), so the Person profile is keyed to our user id.

const ENV = ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'NEXT_PUBLIC_POSTHOG_HOST']
const clearEnv = () => ENV.forEach((k) => delete process.env[k])

const configure = () => {
  process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'
  process.env.POSTHOG_PROJECT_ID = '4242'
}

beforeEach(() => {
  clearEnv()
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(clearEnv)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
// 204 means "no content" and the Response constructor refuses a body with it.
const noContent = () => new Response(null, { status: 204 })

describe('configuration', () => {
  it('reports unconfigured when the keys are absent', () => {
    expect(processorErasureConfigured()).toBe(false)
  })

  it('needs both halves', () => {
    process.env.POSTHOG_PERSONAL_API_KEY = 'phx_test'
    expect(processorErasureConfigured()).toBe(false)
  })

  it('reports configured with both', () => {
    configure()
    expect(processorErasureConfigured()).toBe(true)
  })

  it('says not-configured rather than pretending it erased anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const [result] = await eraseFromProcessors('u1')
    expect(result!.status).toBe('not-configured')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('erasing a PostHog person', () => {
  beforeEach(configure)

  it('resolves the distinct id, then deletes the person AND their events', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ results: [{ id: 99 }] }))
      .mockResolvedValueOnce(noContent())

    const [result] = await eraseFromProcessors('u1')
    expect(result!.status).toBe('deleted')

    const [lookupUrl] = fetchSpy.mock.calls[0]!
    expect(String(lookupUrl)).toContain('/api/projects/4242/persons/?distinct_id=u1')

    const [deleteUrl, deleteInit] = fetchSpy.mock.calls[1]!
    expect(String(deleteUrl)).toContain('/api/projects/4242/persons/99/')
    // Without delete_events the behavioural record survives under a detached
    // distinct id, which is not erasure.
    expect(String(deleteUrl)).toContain('delete_events=true')
    expect((deleteInit as RequestInit).method).toBe('DELETE')
  })

  it('targets the API host, not the ingestion host', async () => {
    // eu.i.posthog.com only accepts events. Calling it here would 404 in a way
    // that reads exactly like "this person does not exist".
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ results: [{ id: 1 }] }))
      .mockResolvedValueOnce(noContent())

    await eraseFromProcessors('u1')
    expect(String(fetchSpy.mock.calls[0]![0]).startsWith('https://eu.posthog.com/')).toBe(true)
  })

  it('treats "no such person" as done, not as a failure', async () => {
    // Someone who never consented to analytics was never sent, so no profile was
    // ever created. There is nothing to erase and that is the correct outcome.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ results: [] }))
    const [result] = await eraseFromProcessors('u1')
    expect(result!.status).toBe('not-found')
  })

  it('reports a failed lookup rather than claiming success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ detail: 'nope' }, 401))
    const [result] = await eraseFromProcessors('u1')
    expect(result!.status).toBe('failed')
    expect(result!.detail).toContain('401')
  })

  it('reports a failed delete rather than claiming success', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ results: [{ id: 7 }] }))
      .mockResolvedValueOnce(json({ detail: 'boom' }, 500))
    const [result] = await eraseFromProcessors('u1')
    expect(result!.status).toBe('failed')
  })

  it('never throws, so a dead third party cannot fail the deletion response', async () => {
    // The account row is already gone by the time this runs. Throwing here would
    // tell the user their deletion failed when it did not.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'))
    await expect(eraseFromProcessors('u1')).resolves.toBeDefined()
  })

  it('logs loudly on failure — that log is the record a manual erasure is owed', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ENOTFOUND'))
    await eraseFromProcessors('u1')
    expect(errorSpy).toHaveBeenCalled()
    expect(String(errorSpy.mock.calls[0]![0])).toContain('u1')
  })
})
