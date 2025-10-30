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
  count: z.number().int().min(1).max(10)
})
export type ModelRequest = z.infer<typeof ModelRequestSchema>

export const JobCreateSchema = z.object({
  mode: ModeSchema,
  prompt: z.string().min(1),
  resolution: z.enum(["1K", "2K", "4K"]).optional(),
  aspect: z.enum(["21:9", "16:9", "9:16"]).optional(),
  seedStrategy: z.enum(["random", "fixed", "increment"]).default("random"),
  seed: z.number().int().optional(),
  imageBase64: z.string().optional(),
  imageBase64s: z.array(z.string()).optional(),
  optimizePrompt: z.boolean().optional().default(true),
  optimizeModel: z.enum(["openai/gpt-5", "anthropic/claude-sonnet-4.5"]).optional(),
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
  usedPrompt?: string
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
  optimizedPrompts?: string[]
}

export type SseEvent =
  | { type: "job_start"; job: Job }
  | { type: "task_update"; subtask: Subtask }
  | { type: "task_result"; subtask: Subtask }
  | { type: "job_complete"; job: Job }
  | { type: "job_cancelled"; job: Job }
