"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"
import { JobCreateSchema, ModelIdSchema } from "@/lib/jobTypes"
import { toBase64 } from "@/lib/utils"

type ModelConfig = {
  id: string
  label: string
  defaultCount: number
}

const ALL_MODELS: ModelConfig[] = [
  { id: "seedream_t2i", label: "Seedream v4 T2I", defaultCount: 1 },
  { id: "seedream_edit", label: "Seedream v4 Edit", defaultCount: 1 },
  { id: "nano_t2i", label: "Nano Banana T2I", defaultCount: 1 },
  { id: "nano_edit", label: "Nano Banana Edit", defaultCount: 1 },
  { id: "flux_kontext", label: "Flux.1 Kontext", defaultCount: 1 },
  { id: "qwen_edit", label: "Qwen Image Edit", defaultCount: 1 }
]

type SseEvent =
  | { type: "job_start"; job: any }
  | { type: "task_update"; subtask: any }
  | { type: "task_result"; subtask: any }
  | { type: "job_complete"; job: any }
  | { type: "job_cancelled"; job: any }

export default function HomePage() {
  const [mode, setMode] = useState<"txt2img" | "img2img">("txt2img")
  const [prompt, setPrompt] = useState("")
  const [negativePrompt, setNegativePrompt] = useState("")
  const [width, setWidth] = useState<number | "">("")
  const [height, setHeight] = useState<number | "">("")
  const [steps, setSteps] = useState<number | "">("")
  const [cfg, setCfg] = useState<number | "">("")
  const [sampler, setSampler] = useState("")
  const [seedStrategy, setSeedStrategy] = useState<"random" | "fixed" | "increment">("random")
  const [seed, setSeed] = useState<number | "">("")
  const [strength, setStrength] = useState<number | "">("")
  const [image, setImage] = useState<string | undefined>()
  const [mask, setMask] = useState<string | undefined>()
  const [modelCounts, setModelCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(ALL_MODELS.map((m) => [m.id, 0]))
  )
  const [jobId, setJobId] = useState<string | null>(null)
  const [events, setEvents] = useState<SseEvent[]>([])
  const [images, setImages] = useState<{ subtaskId: string; url: string }[]>([])
  const esRef = useRef<EventSource | null>(null)

  const selectedModels = useMemo(() => {
    return Object.entries(modelCounts)
      .filter(([, c]) => c > 0)
      .map(([id, c]) => ({ modelId: id, count: c }))
  }, [modelCounts])

  const busy = !!jobId

  useEffect(() => {
    return () => {
      esRef.current?.close()
    }
  }, [])

  async function handleSubmit() {
    const payload = {
      mode,
      prompt,
      negativePrompt: negativePrompt || undefined,
      width: width === "" ? undefined : Number(width),
      height: height === "" ? undefined : Number(height),
      steps: steps === "" ? undefined : Number(steps),
      cfg: cfg === "" ? undefined : Number(cfg),
      sampler: sampler || undefined,
      seedStrategy,
      seed: seed === "" ? undefined : Number(seed),
      strength: strength === "" ? undefined : Number(strength),
      imageBase64: image,
      maskBase64: mask,
      models: selectedModels
    }
    const parsed = JobCreateSchema.safeParse(payload)
    if (!parsed.success) {
      alert("参数不合法，请检查必填项与数值范围")
      return
    }
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data)
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(`创建任务失败: ${data.error || res.statusText}`)
      return
    }
    const data = (await res.json()) as { jobId: string }
    setJobId(data.jobId)
    setEvents([])
    setImages([])
    const es = new EventSource(`/api/jobs/${data.jobId}/events`)
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as SseEvent
      setEvents((prev) => [...prev, ev])
      if (ev.type === "task_result" && ev.subtask?.outputRelativePath) {
        const url = `/api/jobs/${data.jobId}/files/${ev.subtask.outputRelativePath}`
        setImages((prev) => [{ subtaskId: ev.subtask.id, url }, ...prev])
      }
      if (ev.type === "job_complete" || ev.type === "job_cancelled") {
        esRef.current?.close()
        setJobId(null)
      }
    }
    esRef.current = es
  }

  async function handleCancel() {
    if (!jobId) return
    await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" })
    esRef.current?.close()
    setJobId(null)
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 24, padding: 24 }}>
      <section>
        <h1 style={{ marginTop: 0 }}>AI 抽卡出图器</h1>

        <div style={{ marginBottom: 12 }}>
          <label>
            <strong>模式</strong>
          </label>
          <div>
            <label style={{ marginRight: 12 }}>
              <input type="radio" name="mode" value="txt2img" checked={mode === "txt2img"} onChange={() => setMode("txt2img")} /> 文生图
            </label>
            <label>
              <input type="radio" name="mode" value="img2img" checked={mode === "img2img"} onChange={() => setMode("img2img")} /> 图生图/编辑
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label><strong>Prompt</strong></label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} style={{ width: "100%" }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label><strong>Negative Prompt</strong></label>
          <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} rows={2} style={{ width: "100%" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <label>宽</label>
            <input type="number" min={64} step={64} value={width} onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%" }} />
          </div>
          <div>
            <label>高</label>
            <input type="number" min={64} step={64} value={height} onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <label>Steps</label>
            <input type="number" min={1} value={steps} onChange={(e) => setSteps(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%" }} />
          </div>
          <div>
            <label>CFG</label>
            <input type="number" step="0.5" min={0} value={cfg} onChange={(e) => setCfg(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Sampler</label>
          <input type="text" value={sampler} onChange={(e) => setSampler(e.target.value)} style={{ width: "100%" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <label>Seed 策略</label>
            <select value={seedStrategy} onChange={(e) => setSeedStrategy(e.target.value as any)} style={{ width: "100%" }}>
              <option value="random">随机</option>
              <option value="fixed">固定</option>
              <option value="increment">递增</option>
            </select>
          </div>
          <div>
            <label>Seed</label>
            <input type="number" value={seed} onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%" }} />
          </div>
        </div>

        {mode === "img2img" && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label>参考图 Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) setImage(await toBase64(f))
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Mask（可选）</label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (f) setMask(await toBase64(f))
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>强度 Strength</label>
              <input type="number" min={0} max={1} step="0.05" value={strength} onChange={(e) => setStrength(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: "100%" }} />
            </div>
          </>
        )}

        <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
          <strong>选择模型与数量</strong>
          <div>
            {ALL_MODELS.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <label style={{ minWidth: 200 }}>{m.label}</label>
                <input
                  type="number"
                  min={0}
                  value={modelCounts[m.id] ?? 0}
                  onChange={(e) =>
                    setModelCounts((prev) => ({ ...prev, [m.id]: Number(e.target.value) }))
                  }
                  style={{ width: 100 }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button disabled={busy} onClick={handleSubmit} style={{ padding: "8px 14px" }}>
            {busy ? "进行中..." : "开始生成"}
          </button>
          <button disabled={!busy} onClick={handleCancel} style={{ padding: "8px 14px" }}>
            取消
          </button>
        </div>
      </section>

      <section>
        <h3 style={{ marginTop: 0 }}>实时进度</h3>
        <div style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>
          {events.length === 0 ? "暂无" : `事件数：${events.length}`}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 180px)", gap: 12 }}>
          {images.map((img) => (
            <div key={img.subtaskId} style={{ border: "1px solid #ddd", padding: 6 }}>
              <img src={img.url} style={{ width: "100%", height: "auto" }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

