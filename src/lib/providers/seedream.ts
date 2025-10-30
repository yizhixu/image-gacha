import { CommonParams, NormalizedImage } from "./types"
import { createTaskAndWait } from "./kieJobs"
import { uploadBase64ToTempUrl } from "./uploader"

export async function seedreamTxt2Img(params: CommonParams) {
  const endpoint = process.env.KIE_SEEDREAM_T2I_ENDPOINT || ""
  const apiKey = process.env.KIE_API_KEY || ""
  const model = "bytedance/seedream-v4-text-to-image"
  const input: Record<string, unknown> = {
    prompt: params.prompt,
    image_size: seedreamSizeFromAspect(params.aspect),
    image_resolution: params.resolution ?? "1K",
    max_images: 1,
    seed: params.seed
  }
  const urls = await createTaskAndWait({ endpoint, apiKey, model, input, signal: params.signal })
  return urlsToImages(urls, "png", params.seed)
}

export async function seedreamEdit(params: CommonParams) {
  const endpoint = process.env.KIE_SEEDREAM_EDIT_ENDPOINT || ""
  const apiKey = process.env.KIE_API_KEY || ""
  const model = "bytedance/seedream-v4-edit"
  const imgs = normalizeImages(params)
  if (imgs.length === 0) throw new Error("Seedream Edit requires at least one image.")
  const imageUrls: string[] = []
  for (const b64 of imgs) {
    const u = toUrl(b64) || (await uploadBase64ToTempUrl(b64))
    if (u) imageUrls.push(u)
  }
  const input: Record<string, unknown> = {
    prompt: params.prompt,
    image_urls: imageUrls,
    image_size: seedreamSizeFromAspect(params.aspect),
    image_resolution: params.resolution ?? "1K",
    max_images: 1,
    seed: params.seed
  }
  const urls = await createTaskAndWait({ endpoint, apiKey, model, input, signal: params.signal })
  return urlsToImages(urls, "png", params.seed)
}

function seedreamSizeFromAspect(aspect?: string): string {
  switch (aspect) {
    case "21:9":
      return "landscape_21_9"
    case "16:9":
      return "landscape_16_9"
    case "9:16":
      return "portrait_16_9"
    default:
      return "landscape_16_9"
  }
}

function toUrl(v?: string): string | undefined {
  if (!v) return undefined
  if (/^https?:\/\//i.test(v)) return v
  return undefined
}

function urlsToImages(urls: string[], format: string, seed?: number): NormalizedImage[] {
  return urls.map((u) => ({ url: u, format, seed }))
}

function normalizeImages(params: CommonParams): string[] {
  const list = Array.isArray(params.imageBase64s) ? params.imageBase64s.filter(Boolean) : []
  if (params.imageBase64 && list.length === 0) return [params.imageBase64]
  return list
}
