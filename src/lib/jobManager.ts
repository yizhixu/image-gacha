import { EventEmitter } from "node:events"
import path from "node:path"
import { nanoid as makeId } from "@/lib/utils"
import { Job, JobCreateInput, Subtask, SseEvent } from "@/lib/jobTypes"
import { MODELS } from "@/lib/providers/models"
import type { NormalizedImage } from "@/lib/providers/types"
import { saveBuffer, saveJson, OUTPUT_ROOT } from "@/lib/storage"

type Listener = (ev: SseEvent) => void

class JobStore {
  private jobs = new Map<string, Job>()
  private emitters = new Map<string, EventEmitter>()
  private controllers = new Map<string, AbortController>()

  createJob(input: JobCreateInput): Job {
    const id = makeId()
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

    const controller = this.controllers.get(id)
    const subPromises = job.subtasks.map((st) => this.runSubtask(job, st, controller?.signal))
    await Promise.allSettled(subPromises)
    if (job.status !== "cancelled") {
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
      const images = await callProvider(st.modelId, {
        prompt: job.input.prompt,
        negativePrompt: job.input.negativePrompt,
        width: job.input.width,
        height: job.input.height,
        steps: job.input.steps,
        cfg: job.input.cfg,
        sampler: job.input.sampler,
        seed: st.seed,
        imageBase64: job.input.imageBase64,
        maskBase64: job.input.maskBase64,
        strength: job.input.strength,
        signal
      })
      const first = images[0]
      const rel = await this.persistOutput(st, first)
      st.outputRelativePath = rel
      st.status = "succeeded"
      this.updateCounters(job)
      this.emit(job.id, { type: "task_result", subtask: { ...st } })
    } catch (err: any) {
      if (job.status === "cancelled") return
      st.status = "failed"
      st.error = err?.message || "Unknown error"
      this.updateCounters(job)
      this.emit(job.id, { type: "task_update", subtask: { ...st } })
    }
  }

  private async persistOutput(st: Subtask, img: NormalizedImage) {
    const ext = (img.format || "png").replace(".", "")
    const fileName = `seed-${st.seed ?? "na"}__n-${st.index}.${ext}`
    const rel = `${st.provider}/${st.modelName}/${fileName}`
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
    const metaAbs = path.join(OUTPUT_ROOT, st.jobId, st.provider, st.modelName, `seed-${st.seed ?? "na"}__n-${st.index}.json`)
    await saveJson(metaAbs, {
      subtaskId: st.id,
      jobId: st.jobId,
      provider: st.provider,
      model: st.modelName,
      seed: st.seed,
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

export const jobStore = new JobStore()

