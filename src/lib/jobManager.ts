import { EventEmitter } from "node:events"
import path from "node:path"
// import { nanoid as makeId } from "@/lib/utils"
import { Job, JobCreateInput, Subtask, SseEvent } from "@/lib/jobTypes"
import { MODELS } from "@/lib/providers/models"
import type { NormalizedImage } from "@/lib/providers/types"
import { saveBuffer, saveJson, OUTPUT_ROOT } from "@/lib/storage"
import { optimizePrompt, optimizePrompts } from "@/lib/promptEnhancer"

type Listener = (ev: SseEvent) => void

class JobStore {
  private jobs = new Map<string, Job>()
  private emitters = new Map<string, EventEmitter>()
  private controllers = new Map<string, AbortController>()

  createJob(input: JobCreateInput): Job {
    const id = makeTimestampId()
    const subtasks: Subtask[] = []
    let subIndex = 0
    for (const m of input.models) {
      for (let i = 0; i < m.count; i++) {
        const info = MODELS[m.modelId]
        subtasks.push({
          id: `${id}-${subIndex++}`,
          jobId: id,
          modelId: m.modelId,
          index: i,
          status: "queued",
          provider: info.provider,
          modelName: info.defaultModelName
        })
      }
    }
    const job: Job = {
      id,
      input,
      status: "pending",
      createdAt: Date.now(),
      subtasks,
      counters: {
        total: subtasks.length,
        running: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0
      }
    }
    this.jobs.set(id, job)
    this.emitters.set(id, new EventEmitter())
    this.controllers.set(id, new AbortController())
    return job
  }

  getJob(id: string) {
    return this.jobs.get(id)
  }

  subscribe(id: string, fn: Listener) {
    const em = this.emitters.get(id)
    if (!em) return () => {}
    em.on("event", fn)
    return () => em.off("event", fn)
  }

  emit(id: string, ev: SseEvent) {
    const em = this.emitters.get(id)
    em?.emit("event", ev)
  }

  getController(id: string) {
    return this.controllers.get(id)
  }

  async runJob(id: string) {
    const job = this.jobs.get(id)
    if (!job) return
    if (job.status === "cancelled") return
    job.status = "running"
    this.emit(id, { type: "job_start", job })

    // Optimize prompt once per job (if enabled)
    if (job.input.optimizePrompt !== false) {
      try {
        const controller = this.controllers.get(id)
        const maxCount = Math.max(1, ...job.input.models.map((m) => m.count || 1))
        const list = await optimizePrompts(
          job.input.prompt,
          controller?.signal,
          job.input.optimizeModel,
          maxCount
        )
        job.optimizedPrompts = list
      } catch {
        // ignore optimizer errors; fall back to original prompt
        job.optimizedPrompts = [job.input.prompt]
      }
    } else {
      job.optimizedPrompts = [job.input.prompt]
    }

    const controller = this.controllers.get(id)
    const subPromises = job.subtasks.map((st) => this.runSubtask(job, st, controller?.signal))
    await Promise.allSettled(subPromises)
    // Re-read job status to avoid TS narrowing on the local variable
    if (this.jobs.get(id)?.status !== "cancelled") {
      job.status = "completed"
      await this.writeSummary(job)
      this.emit(id, { type: "job_complete", job })
    }
  }

  async cancelJob(id: string) {
    const job = this.jobs.get(id)
    if (!job) return
    job.status = "cancelled"
    this.controllers.get(id)?.abort()
    for (const st of job.subtasks) {
      if (st.status === "queued" || st.status === "running") {
        st.status = "cancelled"
        job.counters.cancelled++
        this.emit(id, { type: "task_update", subtask: { ...st } })
      }
    }
    await this.writeSummary(job)
    this.emit(id, { type: "job_cancelled", job })
  }

  private updateCounters(job: Job) {
    job.counters.running = job.subtasks.filter((s) => s.status === "running").length
    job.counters.succeeded = job.subtasks.filter((s) => s.status === "succeeded").length
    job.counters.failed = job.subtasks.filter((s) => s.status === "failed").length
    job.counters.cancelled = job.subtasks.filter((s) => s.status === "cancelled").length
  }

  private nextSeed(base: number | undefined, strategy: string, idx: number) {
    if (strategy === "fixed") return base
    if (strategy === "increment") return typeof base === "number" ? base + idx : Math.floor(Math.random() * 1e9)
    return Math.floor(Math.random() * 1e9)
  }

  private async runSubtask(job: Job, st: Subtask, signal?: AbortSignal) {
    if (job.status === "cancelled") return
    st.status = "running"
    st.seed = this.nextSeed(job.input.seed, job.input.seedStrategy, st.index)
    this.updateCounters(job)
    this.emit(job.id, { type: "task_update", subtask: { ...st } })

    try {
      const prompts = job.optimizedPrompts && job.optimizedPrompts.length > 0 ? job.optimizedPrompts : [job.input.prompt]
      const promptForThis = prompts[Math.min(st.index, prompts.length - 1)] || prompts[0]
      st.usedPrompt = promptForThis
      const images = await callProvider(st.modelId, {
        prompt: promptForThis,
        resolution: job.input.resolution,
        aspect: job.input.aspect,
        seed: st.seed,
        imageBase64: job.input.imageBase64,
        imageBase64s: job.input.imageBase64s,
        signal
      })
      const first = images[0]
      const rel = await this.persistOutput(st, first)
      st.outputRelativePath = rel
      st.status = "succeeded"
      this.updateCounters(job)
      this.emit(job.id, { type: "task_result", subtask: { ...st } })
    } catch (err: any) {
      if (this.jobs.get(job.id)?.status === "cancelled") return
      st.status = "failed"
      st.error = err?.message || "Unknown error"
      this.updateCounters(job)
      this.emit(job.id, { type: "task_update", subtask: { ...st } })
    }
  }

  private async persistOutput(st: Subtask, img: NormalizedImage) {
    const ext = (img.format || "png").replace(".", "")
    const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_")
    const base = `${safe(st.provider)}__${safe(st.modelName)}__seed-${st.seed ?? "na"}__n-${st.index}`
    const fileName = `${base}.${ext}`
    const rel = `${fileName}`
    const abs = path.join(OUTPUT_ROOT, st.jobId, rel)
    if (img.base64) {
      const base64 = img.base64.replace(/^data:image\/[a-zA-Z]+;base64,/, "")
      const buf = Buffer.from(base64, "base64")
      await saveBuffer(abs, buf)
    } else if (img.url) {
      const res = await fetch(img.url)
      const buf = Buffer.from(await res.arrayBuffer())
      await saveBuffer(abs, buf)
    } else {
      await saveBuffer(abs, Buffer.from(""))
    }
    const metaAbs = path.join(OUTPUT_ROOT, st.jobId, "meta", `${base}.json`)
    await saveJson(metaAbs, {
      subtaskId: st.id,
      jobId: st.jobId,
      provider: st.provider,
      model: st.modelName,
      seed: st.seed,
      prompt: st.usedPrompt,
      createdAt: Date.now()
    })
    return rel
  }

  private async writeSummary(job: Job) {
    const summary = {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: Date.now(),
      counters: job.counters,
      subtasks: job.subtasks.map((s) => ({
        id: s.id,
        modelId: s.modelId,
        provider: s.provider,
        modelName: s.modelName,
        status: s.status,
        seed: s.seed,
        outputRelativePath: s.outputRelativePath,
        error: s.error
      }))
    }
    const abs = path.join(OUTPUT_ROOT, job.id, "summary.json")
    await saveJson(abs, summary)
  }
}

function makeTimestampId(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${y}${m}${day}-${hh}${mm}${ss}`
}

async function callProvider(modelId: string, params: any): Promise<NormalizedImage[]> {
  const { seedreamTxt2Img, seedreamEdit } = await import("@/lib/providers/seedream")
  const { nanoTxt2Img, nanoEdit } = await import("@/lib/providers/nano")
  const { fluxKontext } = await import("@/lib/providers/flux")
  const { qwenEdit } = await import("@/lib/providers/qwen")
  if (modelId === "seedream_t2i") return seedreamTxt2Img(params)
  if (modelId === "seedream_edit") return seedreamEdit(params)
  if (modelId === "nano_t2i") return nanoTxt2Img(params)
  if (modelId === "nano_edit") return nanoEdit(params)
  if (modelId === "flux_kontext") return fluxKontext(params)
  if (modelId === "qwen_edit") return qwenEdit(params)
  throw new Error(`Unknown model: ${modelId}`)
}

const g = globalThis as any
export const jobStore: JobStore = g.__KIE_JOB_STORE__ || (g.__KIE_JOB_STORE__ = new JobStore())
