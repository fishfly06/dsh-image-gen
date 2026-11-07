/** MiniMax uses /image_generation and a nested response, not the OpenAI images protocol. */
import { guardedFetch } from './fetch-diagnostics.js'
import { downloadImage, readBoundedBytes, type GeneratedCompatibleImage } from './openai-compatible.js'
import { redactSecrets } from './redact.js'

export const MINIMAX_ASPECT_RATIOS = ['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'] as const

export async function generateMiniMaxImage(input: {
  apiKey: string
  baseURL: string
  model: string
  prompt: string
  aspectRatio?: string | undefined
  maxBytes: number
  signal: AbortSignal
}): Promise<GeneratedCompatibleImage> {
  const aspectRatio = input.aspectRatio ?? '1:1'
  if (!(MINIMAX_ASPECT_RATIOS as readonly string[]).includes(aspectRatio)) throw new Error('Unsupported MiniMax aspect ratio')
  if (input.prompt.length === 0 || input.prompt.length > 1500) throw new Error('MiniMax prompt must contain 1–1500 characters')
  const response = await guardedFetch('MiniMax image request', input.signal, () => fetch(
    new URL('image_generation', input.baseURL.replace(/\/+$/, '') + '/'), {
      method: 'POST', redirect: 'error', signal: input.signal,
      headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: input.model, prompt: input.prompt, response_format: 'url', n: 1, aspect_ratio: aspectRatio }),
    }), input.apiKey)
  const text = new TextDecoder().decode(await readBoundedBytes(response, 1024 * 1024))
  if (!response.ok) throw new Error(`MiniMax image request failed (${response.status}): ${redactSecrets(text.slice(0, 4096), input.apiKey)}`)
  let payload: { base_resp?: { status_code?: number; status_msg?: string }; data?: { image_urls?: unknown } }
  try { payload = JSON.parse(text) as typeof payload } catch { throw new Error('MiniMax returned invalid image JSON') }
  if (payload?.base_resp?.status_code !== 0) {
    throw new Error(`MiniMax image request failed (${String(payload?.base_resp?.status_code ?? 'unknown')}): ${redactSecrets(String(payload?.base_resp?.status_msg ?? 'Invalid response'), input.apiKey)}`)
  }
  const urls = payload.data?.image_urls
  const url = Array.isArray(urls) ? urls[0] : undefined
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('MiniMax returned no valid image URL')
  // Download signed image URLs without forwarding the service credential.
  return downloadImage(url, 'MiniMax', { baseURL: input.baseURL, maxBytes: input.maxBytes, signal: input.signal })
}
