import { CommonParams, NormalizedImage } from "./types"
import { setTimeout as delay } from "node:timers/promises"
import { uploadBase64ToTempUrl } from "./uploader"

export async function fluxKontext(params: CommonParams) {
  const endpoint = process.env.KIE_FLUX1_KONTEXT_ENDPOINT || ""
  const apiKey = process.env.KIE_API_KEY || ""
  // Flux Kontext 在编辑模式下需要输入图像
  const first = Array.isArray(params.imageBase64s) && params.imageBase64s.length > 0 ? params.imageBase64s[0] : params.imageBase64
  const inputImage = first ? await uploadBase64ToTempUrl(first) : undefined
  if (!inputImage) {
    throw new Error("Flux.1 Kontext 编辑需要参考图像，请上传图片")
  }
  // Create task
  const createRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      prompt: params.prompt,
      aspectRatio: fluxAspect(params.aspect),
      outputFormat: "jpeg",
      enableTranslation: true,
      inputImage
    }),
    signal: params.signal
  })
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "")
    throw new Error(`Flux generate error ${createRes.status}: ${text || createRes.statusText}`)
  }
  const createJson = (await createRes.json().catch(() => ({}))) as any
  const taskId: string | undefined = createJson?.data?.taskId
  if (!taskId) throw new Error("Flux generate did not return a taskId")
  // Poll record-info
  const recordUrl = "https://api.kie.ai/api/v1/flux/kontext/record-info"
  while (true) {
    const url = new URL(recordUrl)
    url.searchParams.set("taskId", taskId)
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      signal: params.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Flux record-info error ${res.status}: ${text || res.statusText}`)
    }
    const info = (await res.json().catch(() => ({}))) as any
    const data = info?.data || {}
    if (data?.errorCode) {
      throw new Error(data?.errorMessage || "Flux generation failed")
    }
    const resp = data?.response
    const urlStr: string | undefined = resp?.resultImageUrl
    if (urlStr) {
      return [{ url: urlStr, format: "jpeg", seed: params.seed }] as NormalizedImage[]
    }
    await delay(1500)
  }
}

function fluxAspect(aspect?: string): string {
  switch (aspect) {
    case "21:9":
    case "16:9":
    case "9:16":
      return aspect
    default:
      return "16:9"
  }
}
