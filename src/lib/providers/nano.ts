import { CommonParams, NormalizedImage } from "./types"
import { createTaskAndWait } from "./kieJobs"
import { uploadBase64ToTempUrl } from "./uploader"

export async function nanoTxt2Img(params: CommonParams) {
  const endpoint = process.env.KIE_NANOBANANA_T2I_ENDPOINT || ""
  const apiKey = process.env.KIE_API_KEY || ""
  const model = "google/nano-banana"
  const input: Record<string, unknown> = {
    prompt: params.prompt,
    output_format: "png",
    image_size: nanoSizeFromAspect(params.aspect)
  }
  const urls = await createTaskAndWait({ endpoint, apiKey, model, input, signal: params.signal })
  return urlsToImages(urls, "png", params.seed)
}

export async function nanoEdit(params: CommonParams) {
  const endpoint = process.env.KIE_NANOBANANA_EDIT_ENDPOINT || ""
  const apiKey = process.env.KIE_API_KEY || ""
  const model = "google/nano-banana-edit"
  const imgs = normalizeImages(params)
  if (imgs.length === 0) throw new Error("Nano Banana Edit requires at least one image.")
  const imageUrls: string[] = []
  for (const b64 of imgs) {
    const u = toUrl(b64) || (await uploadBase64ToTempUrl(b64))
    if (u) imageUrls.push(u)
  }
  const input: Record<string, unknown> = {
    prompt: params.prompt,
    image_urls: imageUrls,
    output_format: "png",
    image_size: nanoSizeFromAspect(params.aspect)
  }
  const urls = await createTaskAndWait({ endpoint, apiKey, model, input, signal: params.signal })
  return urlsToImages(urls, "png", params.seed)
}

function nanoSizeFromAspect(aspect?: string): string {
  switch (aspect) {
    case "21:9":
    case "16:9":
    case "9:16":
      return aspect
    default:
      return "16:9"
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
