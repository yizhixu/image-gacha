import { CommonParams, NormalizedImage } from "./types"
import { createTaskAndWait } from "./kieJobs"
import { uploadBase64ToTempUrl } from "./uploader"

export async function qwenEdit(params: CommonParams) {
  const endpoint = process.env.KIE_QWEN_IMAGE_EDIT_ENDPOINT || ""
  const apiKey = process.env.KIE_API_KEY || ""
  const model = "qwen/image-edit"
  const first = Array.isArray(params.imageBase64s) && params.imageBase64s.length > 0 ? params.imageBase64s[0] : params.imageBase64
  const imageUrl = toUrl(first) || (first ? await uploadBase64ToTempUrl(first) : undefined)
  if (!imageUrl) throw new Error("Qwen Image Edit requires an image. Provide a public URL or base64 data URL.")
  const input: Record<string, unknown> = {
    prompt: params.prompt ?? "",
    image_url: imageUrl,
    image_size: qwenSizeFromAspect(params.aspect),
    seed: params.seed,
    sync_mode: false,
    enable_safety_checker: true,
    output_format: "png",
    
  }
  const urls = await createTaskAndWait({ endpoint, apiKey, model, input, signal: params.signal })
  return urlsToImages(urls, "png", params.seed)
}

function qwenSizeFromAspect(aspect?: string): string {
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
