export interface UploadResult {
  downloadUrl: string
  fileName?: string
  fileSize?: number
  mimeType?: string
}

interface UploadApiResponse {
  success: boolean
  code: number
  msg?: string
  data?: {
    fileName?: string
    filePath?: string
    downloadUrl?: string
    fileSize?: number
    mimeType?: string
    uploadedAt?: string
  }
}

function getUploadEndpoint(): string {
  // Default from docs openapi servers: https://kieai.redpandaai.co
  // path: /api/file-base64-upload
  return (
    process.env.KIE_FILE_BASE64_UPLOAD_ENDPOINT ||
    "https://kieai.redpandaai.co/api/file-base64-upload"
  )
}

export async function uploadBase64ToTempUrl(
  base64Data: string,
  opts?: { uploadPath?: string; fileName?: string; apiKey?: string; signal?: AbortSignal }
): Promise<string> {
  const endpoint = getUploadEndpoint()
  const apiKey = opts?.apiKey || process.env.KIE_API_KEY || ""
  if (!apiKey) throw new Error("Missing KIE_API_KEY for upload")
  const payload = {
    base64Data,
    uploadPath: opts?.uploadPath || "images/base64",
    fileName: opts?.fileName
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload),
    signal: opts?.signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Upload error ${res.status}: ${text || res.statusText}`)
  }
  const json = (await res.json().catch(() => ({}))) as UploadApiResponse
  const url = json?.data?.downloadUrl
  if (!json?.success || json?.code !== 200 || !url) {
    throw new Error(json?.msg || "Upload failed")
  }
  return url
}

