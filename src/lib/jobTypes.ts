import { z } from "zod"

export const ModeSchema = z.enum(["txt2img", "img2img"])
export type Mode = z.infer<typeof ModeSchema>

export const ModelIdSchema = z.enum([
  "seedream_t2i",
  "seedream_edit",
  "nano_t2i",
  "nano_edit",
  "flux_kontext",
  "qwen_edit"
])
export type ModelId = z.infer<typeof ModelIdSchema>

export const ModelRequestSchema = z.object({
  modelId: ModelIdSchema,
  count: z.number().int().positive()
})
export type ModelRequest = z.infer<typeof ModelRequestSchema>

export const JobCreateSchema = z.object({
  mode: ModeSchema,
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  steps: z.number().int().positive().optional(),
  cfg: z.number().positive().optional(),
  sampler: z.string().optional(),
  seedStrategy: z.enum(["random", "fixed", "increment"]).default("random"),
  seed: z.number().int().optional(),
  strength: z.number().min(0).max(1).optional(),
  imageBase64: z.string().optional(),
  maskBase64: z.string().optional(),
  models: z.array(ModelRequestSchema).min(1)
})
export type JobCreateInput = z.infer<typeof JobCreateSchema>

export type SubtaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export interface Subtask {
  id: string
  jobId: string
  modelId: ModelId
  index: number
  status: SubtaskStatus
  error?: string
  seed?: number
  provider: string
  modelName: string
  outputRelativePath?: string
}

export interface Job {
  id: string
  input: JobCreateInput
  status: "pending" | "running" | "completed" | "cancelled"
  createdAt: number
  subtasks: Subtask[]
  counters: {
    total: number
    running: number
    succeeded: number
    failed: number
    cancelled: number
  }
}

export type SseEvent =
  | { type: "job_start"; job: Job }
  | { type: "task_update"; subtask: Subtask }
  | { type: "task_result"; subtask: Subtask }
  | { type: "job_complete"; job: Job }
  | { type: "job_cancelled"; job: Job }

