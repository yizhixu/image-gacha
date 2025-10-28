import { kieGenerate, extractImages, KieImageItem } from "./kieClient"
import { CommonParams } from "./types"

export async function fluxKontext(params: CommonParams) {
  const endpoint = process.env.KIE_FLUX1_KONTEXT_ENDPOINT || ""
  const apiKey = process.env.KIE_API_KEY || ""
  const payload: Record<string, unknown> = {
    prompt: params.prompt,
    negative_prompt: params.negativePrompt,
    width: params.width,
    height: params.height,
    steps: params.steps,
    guidance: params.cfg,
    sampler: params.sampler,
    seed: params.seed
  }
  const resp = await kieGenerate({ endpoint, apiKey, payload, signal: params.signal })
  return normalizeItems(resp, "png")
}

function normalizeItems(resp: any, fallbackFormat: string) {
  const items = extractImages(resp)
  return items.map((it: KieImageItem) => ({
    base64: it.base64 || it.b64_json,
    url: it.url,
    format: it.format || fallbackFormat,
    seed: it.seed
  }))
}

