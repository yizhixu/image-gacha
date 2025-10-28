import { setTimeout as delay } from "node:timers/promises"

export interface KieGenerateParams {
  endpoint: string
  apiKey: string
  payload: Record<string, unknown>
  signal?: AbortSignal
  timeoutMs?: number
  retries?: number
}

export interface KieImageItem {
  base64?: string
  b64_json?: string
  url?: string
  format?: string
  seed?: number
}

export interface KieGenerateResponse {
  images?: KieImageItem[]
  data?: KieImageItem[]
  result?: KieImageItem | KieImageItem[]
  [k: string]: unknown
}

export async function kieGenerate({
  endpoint,
  apiKey,
  payload,
  signal,
  timeoutMs = 120_000,
  retries = 2
}: KieGenerateParams): Promise<KieGenerateResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const combined = new AbortController()
  const onAbort = () => combined.abort()
  signal?.addEventListener("abort", onAbort)

  try {
    let attempt = 0
    let lastErr: unknown
    while (attempt <= retries) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
        if (!res.ok) {
          const text = await res.text().catch(() => "")
          const err = new Error(`Kie.ai error ${res.status}: ${text || res.statusText}`)
          if (res.status >= 500 || res.status === 429) throw err
          throw err
        }
        const json = (await res.json()) as KieGenerateResponse
        return json
      } catch (err) {
        lastErr = err
        attempt++
        if (attempt > retries) break
        await delay(300 * attempt + Math.floor(Math.random() * 200))
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Kie.ai request failed")
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}

export function extractImages(resp: KieGenerateResponse): KieImageItem[] {
  if (Array.isArray(resp.images)) return resp.images
  if (Array.isArray(resp.data)) return resp.data
  if (resp.result && Array.isArray(resp.result)) return resp.result
  if (resp.result && typeof resp.result === "object") return [resp.result as KieImageItem]
  return []
}

