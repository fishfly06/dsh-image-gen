import { afterEach, describe, expect, it, vi } from 'vitest'
import { Config, resolveProvider, withProviderOverrides } from '../src/config.js'
import { generateMiniMaxImage } from '../src/minimax.js'
import { CLOUD_CREDENTIAL_REFS, CLOUD_IMAGE_PROVIDERS } from '../src/shared.js'
import { studioProfile } from '../src/studio.js'
import { conversationRegenerateRequest } from '../src/client/conversation-regenerate.js'

afterEach(() => vi.unstubAllGlobals())
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])
const input = { apiKey: 'fixture-minimax-key', baseURL: 'https://api.minimax.cn/v1', model: 'image-01', prompt: 'fixture', maxBytes: 1024, signal: AbortSignal.timeout(5000) }

describe('MiniMax native image provider', () => {
  it('accepts the saved provider and resolves its independent model, endpoint and credential', () => {
    expect(() => Config({ provider: 'minimax', minimaxModel: 'image-01', minimaxBaseURL: input.baseURL })).not.toThrow()
    expect(resolveProvider({ provider: 'minimax' })).toMatchObject({ provider: 'minimax', model: 'image-01', baseURL: input.baseURL, apiKeyEnv: 'MINIMAX_API_KEY' })
    expect(withProviderOverrides({ provider: 'minimax' }, undefined, 'image-01-live')).toMatchObject({ minimaxModel: 'image-01-live' })
    expect(CLOUD_CREDENTIAL_REFS.minimax).toBe('MINIMAX_API_KEY')
    expect(CLOUD_IMAGE_PROVIDERS).toContain('minimax')
    expect(studioProfile({}, 'minimax', true)).toMatchObject({ model: 'image-01', configured: true, supportsEditing: false, defaultRatio: '1:1' })
    expect(conversationRegenerateRequest({ provider: 'minimax', model: 'image-01', output: '16:9' }, 'fixture')).toMatchObject({ provider: 'minimax', ratio: '16:9', quality: 'standard' })
  })

  it('uses the native endpoint and parses data.image_urls without sending its key to the CDN', async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === 'POST'
      ? Response.json({ base_resp: { status_code: 0 }, data: { image_urls: ['https://cdn.example/image.jpg'] } })
      : new Response(bytes, { headers: { 'content-type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetch)
    await expect(generateMiniMaxImage({ ...input, aspectRatio: '16:9' })).resolves.toEqual({ data: bytes, mediaType: 'image/jpeg' })
    expect(String(fetch.mock.calls[0]?.[0])).toBe(input.baseURL + '/image_generation')
    const request = fetch.mock.calls[0]?.[1]
    expect(JSON.parse(request?.body as string)).toEqual({ model: 'image-01', prompt: 'fixture', response_format: 'url', n: 1, aspect_ratio: '16:9' })
    expect(request?.headers).toMatchObject({ authorization: 'Bearer fixture-minimax-key' })
    expect(fetch.mock.calls[1]?.[1]?.headers ?? {}).not.toHaveProperty('authorization')
  })

  it('rejects business errors without downloading, retrying, or exposing the key', async () => {
    const fetch = vi.fn(async () => Response.json({ base_resp: { status_code: 1004, status_msg: `invalid ${input.apiKey}` } }))
    vi.stubGlobal('fetch', fetch)
    await expect(generateMiniMaxImage(input)).rejects.toThrow(/1004/)
    await expect(generateMiniMaxImage(input)).rejects.not.toThrow(input.apiKey)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('enforces image byte limits and rejects malformed results', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => init?.method === 'POST'
      ? Response.json({ base_resp: { status_code: 0 }, data: { image_urls: ['https://cdn.example/image.jpg'] } })
      : new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })))
    await expect(generateMiniMaxImage({ ...input, maxBytes: 2 })).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ base_resp: { status_code: 0 }, data: {} })))
    await expect(generateMiniMaxImage(input)).rejects.toThrow(/image/i)
  })

  it('validates unsupported aspect ratios before making a request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(generateMiniMaxImage({ ...input, aspectRatio: '4:5' })).rejects.toThrow(/ratio/i)
    expect(fetch).not.toHaveBeenCalled()
  })
})
