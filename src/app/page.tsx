"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { z } from "zod"
import { JobCreateSchema, ModelIdSchema } from "@/lib/jobTypes"
import { toBase64 } from "@/lib/utils"
import { MODELS } from "@/lib/providers/models"

type ModelConfig = {
  id: string
  label: string
  defaultCount: number
}

const ALL_MODELS: ModelConfig[] = Object.values(MODELS).map((m) => ({
  id: m.id,
  label: m.displayName,
  defaultCount: 1
}))

type SseEvent =
  | { type: "job_start"; job: any }
  | { type: "task_update"; subtask: any }
  | { type: "task_result"; subtask: any }
  | { type: "job_complete"; job: any }
  | { type: "job_cancelled"; job: any }

export default function HomePage() {
  const [mode, setMode] = useState<"txt2img" | "img2img">("img2img")
  const [prompt, setPrompt] = useState("")
  const [resolution, setResolution] = useState<"1K" | "2K" | "4K">("2K")
  const [aspect, setAspect] = useState<"21:9" | "16:9" | "9:16">("21:9")
  
  const [seedStrategy, setSeedStrategy] = useState<"random" | "fixed" | "increment">("random")
  const [seed, setSeed] = useState<number | "">("")
  const [images, setImages] = useState<string[]>([])
  const [optimizePrompt, setOptimizePrompt] = useState<boolean>(mode === "txt2img")
  const [optimizePromptTouched, setOptimizePromptTouched] = useState<boolean>(false)
  const [optimizeModel, setOptimizeModel] = useState<string>("openai/gpt-5")
  const [modelCounts, setModelCounts] = useState<Record<string, number>>(() => {
    return Object.fromEntries(ALL_MODELS.map((m) => [m.id, m.defaultCount]))
  })
  const [jobId, setJobId] = useState<string | null>(null)
  const [events, setEvents] = useState<SseEvent[]>([])
  type OutputItem = { subtaskId: string; url: string; modelId: string; modelName: string; usedPrompt?: string; jobId: string }
  const [outputs, setOutputs] = useState<OutputItem[]>([])
  const [preview, setPreview] = useState<{ index: number } | null>(null)
  const [refPreview, setRefPreview] = useState<{ index: number } | null>(null)
  const [progressExpanded, setProgressExpanded] = useState<boolean>(true)
  const [dragOver, setDragOver] = useState<boolean>(false)
  const [jobGroups, setJobGroups] = useState<Record<string, { startedAt: number; collapsed: boolean }>>({})
  const [onlyCurrent, setOnlyCurrent] = useState<boolean>(false)
  const [modelFilter, setModelFilter] = useState<string>("all")
  const esRef = useRef<EventSource | null>(null)

  type TaskView = {
    id: string
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
    modelId: string
    modelName: string
    index: number
    seed?: number
    usedPrompt?: string
    error?: string
    startedAt?: number
  }
  const [tasks, setTasks] = useState<Record<string, TaskView>>({})

  async function urlToDataUrl(url: string): Promise<string> {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string) || "")
      reader.onerror = (e) => reject(e)
      reader.readAsDataURL(blob)
    })
  }

  async function useAsReference(url: string) {
    try {
      // 若当前是文生图，切换到图片编辑模式
      if (mode !== "img2img") setMode("img2img")
      const b64 = await urlToDataUrl(url)
      setImages((prev) => {
        // 简单去重：避免连续添加同一张
        if (prev.includes(b64)) return prev
        return [b64, ...prev]
      })
    } catch (e) {
      alert("添加为参考图失败，请重试")
    }
  }

  const visibleModelIds = useMemo<string[]>(() => {
    return Object.values(MODELS)
      .filter((m) => m.mode === mode)
      .map((m) => m.id as unknown as string)
  }, [mode])

  const selectedModels = useMemo(() => {
    const allowed = new Set<string>(visibleModelIds)
    return Object.entries(modelCounts)
      .filter(([id, c]) => c > 0 && allowed.has(id))
      .map(([id, c]) => ({ modelId: id as any, count: Math.min(10, c) }))
  }, [modelCounts, visibleModelIds])

  const busy = !!jobId

  useEffect(() => {
    return () => {
      esRef.current?.close()
    }
  }, [])
  useEffect(() => {
    // Default behavior: txt2img => optimize on, img2img => optimize off
    if (!optimizePromptTouched) {
      setOptimizePrompt(mode === "txt2img")
    }
  }, [mode, optimizePromptTouched])

  async function handleSubmit() {
    const payload = {
      mode,
      prompt,
      resolution,
      aspect,
      
      seedStrategy,
      seed: seed === "" ? undefined : Number(seed),
      imageBase64: images[0],
      imageBase64s: images,
      optimizePrompt,
      optimizeModel,
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
    const es = new EventSource(`/api/jobs/${data.jobId}/events`)
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as SseEvent
      setEvents((prev) => [...prev, ev])
      // Initialize tasks on job_start
      if (ev.type === "job_start" && (ev as any).job?.subtasks) {
        setProgressExpanded(true)
        setJobGroups((prev) => ({ ...prev, [data.jobId]: { startedAt: Date.now(), collapsed: false } }))
        const subs: any[] = (ev as any).job.subtasks || []
        setTasks(() => {
          const next: Record<string, TaskView> = {}
          for (const s of subs) {
            next[s.id] = {
              id: s.id,
              status: s.status,
              modelId: s.modelId,
              modelName: s.modelName,
              index: s.index,
              seed: s.seed,
              usedPrompt: s.usedPrompt
            }
          }
          return next
        })
      }
      // Helper to apply subtask updates
      const applySubtask = (sub: any) => {
        if (!sub?.id) return
        setTasks((prev) => {
          const cur = prev[sub.id] || {
            id: sub.id,
            status: sub.status || "queued",
            modelId: sub.modelId,
            modelName: sub.modelName,
            index: sub.index ?? 0
          }
          const next: TaskView = {
            ...cur,
            status: sub.status || cur.status,
            seed: sub.seed ?? cur.seed,
            usedPrompt: sub.usedPrompt ?? cur.usedPrompt,
            error: sub.error ?? cur.error,
            startedAt: (sub.status === "running" && !cur.startedAt) ? Date.now() : cur.startedAt
          }
          return { ...prev, [sub.id]: next }
        })
      }
      if (ev.type === "task_update" && (ev as any).subtask) {
        applySubtask((ev as any).subtask)
      }
      if (ev.type === "task_result" && ev.subtask?.outputRelativePath) {
        const url = `/api/jobs/${data.jobId}/files/${ev.subtask.outputRelativePath}`
        const modelId: string = ev.subtask?.modelId || ""
        const modelName: string = ev.subtask?.modelName || ""
        const usedPrompt: string | undefined = ev.subtask?.usedPrompt
        setOutputs((prev) => [{ subtaskId: ev.subtask.id, url, modelId, modelName, usedPrompt, jobId: data.jobId }, ...prev])
        applySubtask(ev.subtask)
      }
      if (ev.type === "job_complete" || ev.type === "job_cancelled") {
        setJobGroups((prev) => {
          const g = prev[data.jobId]
          return { ...prev, [data.jobId]: { startedAt: g?.startedAt ?? Date.now(), collapsed: true } }
        })
        setProgressExpanded(false)
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
        <h1 style={{ marginTop: 0 }}>影视抽卡王</h1>

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
          <label>
            <input
              type="checkbox"
              checked={optimizePrompt}
              onChange={(e) => {
                setOptimizePromptTouched(true)
                setOptimizePrompt(e.target.checked)
              }}
              style={{ marginRight: 6 }}
            />
            优化 Prompt（GPT‑5，经 OpenRouter）
          </label>
        </div>
        {optimizePrompt && (
          <div style={{ marginBottom: 12 }}>
            <label>优化模型（OpenRouter）</label>
            <select value={optimizeModel} onChange={(e) => setOptimizeModel(e.target.value)} style={{ width: "100%" }}>
              <option value="openai/gpt-5">GPT‑5（openai/gpt-5）</option>
              <option value="anthropic/claude-sonnet-4.5">Claude Sonnet 4.5（anthropic/claude-sonnet-4.5）</option>
            </select>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label><strong>Prompt</strong></label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} style={{ width: "100%" }} />
        </div>

        

        <div style={{ marginBottom: 12 }}>
          <label>分辨率</label>
          <select value={resolution} onChange={(e) => setResolution(e.target.value as any)} style={{ width: "100%" }}>
            <option value="1K">1K</option>
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>画幅比例</label>
          <select value={aspect} onChange={(e) => setAspect(e.target.value as any)} style={{ width: "100%" }}>
            <option value="21:9">21:9</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
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
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                border: `2px dashed ${dragOver ? "#1976d2" : "#ddd"}`,
                borderRadius: 8,
                background: dragOver ? "rgba(25,118,210,0.06)" : "transparent"
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setDragOver(false)
              }}
              onDrop={async (e) => {
                e.preventDefault()
                setDragOver(false)
                const dt = e.dataTransfer
                const files = Array.from(dt.files || [])
                const adds: string[] = []
                for (const f of files) {
                  try {
                    // 仅接受图片文件；若要支持其他类型可在此扩展
                    if (f.type && f.type.startsWith("image/")) {
                      adds.push(await toBase64(f))
                    }
                  } catch {}
                }
                const uriList = dt.getData("text/uri-list") || ""
                const plain = dt.getData("text/plain") || ""
                const urls: string[] = []
                if (uriList.trim()) urls.push(uriList.trim())
                if (plain.trim() && /^https?:\/\//i.test(plain.trim())) urls.push(plain.trim())
                setImages((prev) => {
                  const next = prev.slice()
                  for (const s of [...adds, ...urls]) {
                    if (!next.includes(s)) next.push(s)
                  }
                  return next
                })
              }}
            >
              <label>参考图 Image（可多张）</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files || [])
                  const b64s: string[] = []
                  for (const f of files) {
                    b64s.push(await toBase64(f))
                  }
                  setImages((prev) => {
                    const next = prev.slice()
                    for (const s of b64s) {
                      if (!next.includes(s)) next.push(s)
                    }
                    return next
                  })
                }}
              />
              {images.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      预览（Qwen/Flux 仅使用第一张）— 当前共 {images.length} 张，可拖动顺序（↑/↓）或移除
                    </div>
                    <button
                      onClick={() => setImages([])}
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      title="清空所有参考图"
                    >
                      清空参考图
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                    {images.map((src, idx) => (
                      <div key={idx} style={{ position: "relative" }}>
                        <img
                          src={src}
                          alt={`参考图${idx + 1}`}
                          style={{ width: "100%", height: 120, objectFit: "cover", border: "1px solid #eee", borderRadius: 6, cursor: "zoom-in" }}
                          onClick={() => setRefPreview({ index: idx })}
                        />
                        <div style={{ position: "absolute", top: 6, left: 6, display: "flex", gap: 4 }}>
                          <button
                            onClick={() => setImages((prev) => {
                              if (idx <= 0) return prev
                              const arr = prev.slice()
                              const t = arr[idx - 1]
                              arr[idx - 1] = arr[idx]
                              arr[idx] = t
                              return arr
                            })}
                            title="前移（↑）"
                            style={{ padding: "2px 6px", fontSize: 12, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => setImages((prev) => {
                              if (idx >= prev.length - 1) return prev
                              const arr = prev.slice()
                              const t = arr[idx + 1]
                              arr[idx + 1] = arr[idx]
                              arr[idx] = t
                              return arr
                            })}
                            title="后移（↓）"
                            style={{ padding: "2px 6px", fontSize: 12, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
                          >
                            ↓
                          </button>
                        </div>
                        <button
                          onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                          title="移除这张参考图"
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            padding: "4px 6px",
                            fontSize: 12,
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer"
                          }}
                        >
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {refPreview && images[refPreview.index] && (
          <div
            onClick={() => setRefPreview(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              padding: 20
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#111", padding: 12, borderRadius: 8, maxWidth: "90vw", maxHeight: "90vh" }}
            >
              <div style={{ color: "#fff", marginBottom: 8, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>参考图预览</div>
                <div>{refPreview.index + 1} / {images.length}</div>
              </div>
              <div style={{ position: "relative" }}>
                <img
                  src={images[refPreview.index]}
                  alt={`参考图${refPreview.index + 1}`}
                  style={{ maxWidth: "85vw", maxHeight: "80vh", display: "block", borderRadius: 6 }}
                />
                <button
                  onClick={() => setRefPreview((p) => p ? ({ index: (p.index - 1 + images.length) % images.length }) : p)}
                  style={{
                    position: "absolute", top: "50%", left: -8, transform: "translate(-100%, -50%)",
                    padding: "8px 10px", borderRadius: 6, border: "1px solid #444", background: "#222", color: "#fff", cursor: "pointer"
                  }}
                  title="上一张"
                >←</button>
                <button
                  onClick={() => setRefPreview((p) => p ? ({ index: (p.index + 1) % images.length }) : p)}
                  style={{
                    position: "absolute", top: "50%", right: -8, transform: "translate(100%, -50%)",
                    padding: "8px 10px", borderRadius: 6, border: "1px solid #444", background: "#222", color: "#fff", cursor: "pointer"
                  }}
                  title="下一张"
                >→</button>
              </div>
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <button onClick={() => setRefPreview(null)} style={{ padding: "6px 10px" }}>关闭</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
          <strong>选择模型与数量</strong>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>每个模型最多 10 张</div>
          <div>
            {ALL_MODELS.filter((m) => visibleModelIds.includes(m.id)).map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <label style={{ minWidth: 200 }}>{m.label}</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={modelCounts[m.id] ?? 0}
                  onChange={(e) =>
                    setModelCounts((prev) => ({ ...prev, [m.id]: Math.max(0, Math.min(10, Number(e.target.value))) }))
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>实时进度</h3>
          <button
            onClick={() => setProgressExpanded((v) => !v)}
            style={{ padding: "4px 8px", fontSize: 12 }}
            title={progressExpanded ? "折叠进度" : "展开进度"}
          >
            {progressExpanded ? "折叠" : "展开"}
          </button>
        </div>
        {(() => {
          const list = Object.values(tasks)
          const total = list.length
          const running = list.filter((t) => t.status === "running").length
          const succeeded = list.filter((t) => t.status === "succeeded").length
          const failed = list.filter((t) => t.status === "failed").length
          const cancelled = list.filter((t) => t.status === "cancelled").length
          const done = succeeded + failed + cancelled
          const pct = total > 0 ? Math.round((done / total) * 100) : 0
          if (!progressExpanded) {
            return (
              <div style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>
                {total === 0 ? "暂无" : `进度（已折叠）：${done}/${total}（${pct}%） · 成功：${succeeded} · 失败：${failed}`}
              </div>
            )
          }
          return (
            <>
              <div style={{ marginBottom: 8, fontSize: 14, color: "#666" }}>
                {total === 0 ? "暂无" : `进度：${done}/${total}（${pct}%） · 运行中：${running} · 成功：${succeeded} · 失败：${failed} · 取消：${cancelled} · 事件：${events.length}`}
              </div>
              <div style={{ height: 6, background: "#eee", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "#4caf50" }} />
              </div>
              {list.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  {list.sort((a, b) => a.index - b.index).map((t) => {
                    const label = (MODELS as any)[t.modelId]?.displayName || t.modelName || t.modelId
                    const statusColor =
                      t.status === "succeeded" ? "#2e7d32" :
                      t.status === "failed" ? "#c62828" :
                      t.status === "running" ? "#1976d2" :
                      t.status === "cancelled" ? "#6d4c41" : "#616161"
                    const duration = t.startedAt ? `${Math.floor((Date.now() - t.startedAt)/1000)}s` : ""
                    return (
                      <div key={t.id} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ fontSize: 12, color: "#333" }}>{label} · #{t.index}</div>
                          <div style={{ fontSize: 12, color: statusColor }}>{t.status}{t.status === "running" && duration ? ` · ${duration}` : ""}</div>
                        </div>
                        {typeof t.seed === "number" && (
                          <div style={{ fontSize: 12, color: "#666" }}>Seed: {t.seed}</div>
                        )}
                        {t.usedPrompt && (
                          <div style={{ fontSize: 12, color: "#666", marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {t.usedPrompt}
                          </div>
                        )}
                        {t.error && (
                          <div style={{ fontSize: 12, color: "#c62828", marginTop: 4 }}>错误：{t.error}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}
        {/* Filters for history */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, marginBottom: 12 }}>
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} style={{ marginRight: 6 }} />
            仅看当前任务
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>模型过滤</span>
            <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} style={{ padding: "2px 6px" }}>
              <option value="all">全部</option>
              {ALL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Group by job id */}
        {(() => {
          const filtered = outputs
            .filter((o) => (onlyCurrent && jobId ? o.jobId === jobId : true))
            .filter((o) => (modelFilter === "all" ? true : o.modelId === modelFilter))
          const meta = jobGroups
          const grouped: Record<string, OutputItem[]> = {}
          for (const it of filtered) {
            (grouped[it.jobId] ||= []).push(it)
          }
          const groups = Object.entries(grouped)
            .map(([jid, items]) => ({ jid, items, startedAt: meta[jid]?.startedAt ?? 0, collapsed: meta[jid]?.collapsed ?? false }))
            .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
          return (
            <>
              {groups.map((g) => (
                <div key={g.jid} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontWeight: 600 }}>
                      任务 {g.jid} · 图片 {g.items.length} 张{jobId === g.jid ? " · 当前" : ""}
                    </div>
                    <div>
                      <button
                        onClick={() => setJobGroups((prev) => ({ ...prev, [g.jid]: { startedAt: g.startedAt, collapsed: !g.collapsed } }))}
                        style={{ padding: "4px 8px" }}
                      >
                        {g.collapsed ? "展开" : "折叠"}
                      </button>
                    </div>
                  </div>
                  {!g.collapsed && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 180px)", gap: 12 }}>
                      {g.items.map((out) => {
                        const idx = filtered.findIndex((x) => x.subtaskId === out.subtaskId)
                        const label =
                          (MODELS as any)[out.modelId]?.displayName ||
                          out.modelName ||
                          out.modelId
                        return (
                          <div key={out.subtaskId} style={{ border: "1px solid #ddd", padding: 6, borderRadius: 6 }}>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 6, lineHeight: 1.3 }}>{label}</div>
                            <img
                              src={out.url}
                              alt={label}
                              style={{ width: "100%", height: 120, objectFit: "cover", cursor: "zoom-in", borderRadius: 4 }}
                              onClick={() => setPreview({ index: idx })}
                            />
                            {out.usedPrompt && (
                              <div style={{ fontSize: 11, color: "#666", marginTop: 6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                {out.usedPrompt}
                              </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                              <button onClick={() => setPreview({ index: idx })} style={{ padding: "4px 8px" }}>
                                预览
                              </button>
                              <button onClick={() => useAsReference(out.url)} style={{ padding: "4px 8px" }}>
                                设为参考图
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </>
          )
        })()}
        {(() => {
          const filtered = outputs
            .filter((o) => (onlyCurrent && jobId ? o.jobId === jobId : true))
            .filter((o) => (modelFilter === "all" ? true : o.modelId === modelFilter))
          return preview && filtered[preview.index] ? (
          <div
            onClick={() => setPreview(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: 20
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#111", padding: 12, borderRadius: 8, maxWidth: "90vw", maxHeight: "90vh" }}
            >
              {(() => {
                const cur = filtered[preview.index]
                const label = (MODELS as any)[cur.modelId]?.displayName || cur.modelName || cur.modelId
                const total = filtered.length
                return (
                  <>
                    <div style={{ color: "#fff", marginBottom: 8, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>{label}</div>
                      <div>{preview.index + 1} / {total}</div>
                    </div>
                    <div style={{ position: "relative" }}>
                      <img
                        src={cur.url}
                        alt={label}
                        style={{ maxWidth: "85vw", maxHeight: "80vh", display: "block", borderRadius: 6 }}
                      />
                      <button
                        onClick={() => setPreview((p) => p ? ({ index: (p.index - 1 + total) % total }) : p)}
                        style={{
                          position: "absolute", top: "50%", left: -8, transform: "translate(-100%, -50%)",
                          padding: "8px 10px", borderRadius: 6, border: "1px solid #444", background: "#222", color: "#fff", cursor: "pointer"
                        }}
                        title="上一张"
                      >←</button>
                      <button
                        onClick={() => setPreview((p) => p ? ({ index: (p.index + 1) % total }) : p)}
                        style={{
                          position: "absolute", top: "50%", right: -8, transform: "translate(100%, -50%)",
                          padding: "8px 10px", borderRadius: 6, border: "1px solid #444", background: "#222", color: "#fff", cursor: "pointer"
                        }}
                        title="下一张"
                      >→</button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <div style={{ color: "#aaa", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: "70vw" }}>
                        {cur.usedPrompt ? `使用的 Prompt：${cur.usedPrompt}` : ""}
                      </div>
                      <button onClick={() => setPreview(null)} style={{ padding: "6px 10px" }}>关闭</button>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
          ) : null
        })()}
      </section>
    </div>
  )
}
