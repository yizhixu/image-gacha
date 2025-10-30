import { setTimeout as delay } from "node:timers/promises"

interface CreateTaskResponse {
  code: number
  msg?: string
  data?: { taskId?: string; recordId?: string }
}

interface RecordInfoResponse {
  code: number
  msg?: string
  data?: {
    taskId?: string
    model?: string
    state?: string
    resultJson?: string
    response?: any
    errorCode?: number | null
    errorMessage?: string | null
    successFlag?: number
  }
}

export async function createTaskAndWait({
  endpoint,
  apiKey,
  model,
  input,
  signal,
  timeoutMs = 180_000,
  pollIntervalMs = 1500
}: {
  endpoint: string
  apiKey: string
  model: string
  input: Record<string, unknown>
  signal?: AbortSignal
  timeoutMs?: number
  pollIntervalMs?: number
}): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener("abort", onAbort)
  try {
    const taskId = await createTask({ endpoint, apiKey, model, input, signal: controller.signal })
    const urls = await pollRecordInfo({
      apiKey,
      taskId,
      recordInfoUrl: "https://api.kie.ai/api/v1/jobs/recordInfo",
      signal: controller.signal,
      pollIntervalMs
    })
    return urls
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}

async function createTask({
  endpoint,
  apiKey,
  model,
  input,
  signal
}: {
  endpoint: string
  apiKey: string
  model: string
  input: Record<string, unknown>
  signal?: AbortSignal
}): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, input }),
    signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Kie.ai createTask error ${res.status}: ${text || res.statusText}`)
  }
  const json = (await res.json().catch(() => ({}))) as CreateTaskResponse
  if (json.code !== 200 || !json.data?.taskId) {
    throw new Error(`Kie.ai createTask failed: ${json.msg || "unknown error"}`)
  }
  return json.data.taskId
}

async function pollRecordInfo({
  apiKey,
  taskId,
  recordInfoUrl,
  signal,
  pollIntervalMs
}: {
  apiKey: string
  taskId: string
  recordInfoUrl: string
  signal?: AbortSignal
  pollIntervalMs: number
}): Promise<string[]> {
  while (true) {
    const url = new URL(recordInfoUrl)
    url.searchParams.set("taskId", taskId)
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Kie.ai recordInfo error ${res.status}: ${text || res.statusText}`)
    }
    const info = (await res.json().catch(() => ({}))) as RecordInfoResponse
    if (info.code !== 200) {
      throw new Error(`Kie.ai recordInfo failed: ${info.msg || "unknown error"}`)
    }
    const data = info.data || {}
    if (data.errorCode || (typeof data.successFlag === "number" && data.successFlag === 2)) {
      throw new Error(data.errorMessage || "Generation failed")
    }
    // Result via resultJson (jobs flow)
    if (typeof data.resultJson === "string" && data.resultJson.length > 0) {
      try {
        const parsed = JSON.parse(data.resultJson)
        const urls: string[] =
          Array.isArray(parsed?.resultUrls) ? parsed.resultUrls.filter((u: any) => typeof u === "string") : []
        if (urls.length > 0) return urls
      } catch {
        // fall through, keep polling
      }
    }
    // Result via response.resultImageUrl (flux-like flow)
    const response: any = data.response
    if (response && typeof response === "object") {
      const candidates: string[] = []
      if (typeof response.resultImageUrl === "string") candidates.push(response.resultImageUrl)
      if (Array.isArray(response.result_urls)) candidates.push(...response.result_urls.filter((x: any) => typeof x === "string"))
      if (Array.isArray(response.resultUrls)) candidates.push(...response.resultUrls.filter((x: any) => typeof x === "string"))
      if (candidates.length > 0) return candidates
    }
    // Continue polling
    await delay(pollIntervalMs)
  }
}

