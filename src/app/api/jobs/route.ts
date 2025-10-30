import { NextRequest, NextResponse } from "next/server"
import { JobCreateInput, JobCreateSchema } from "@/lib/jobTypes"
import { jobStore } from "@/lib/jobManager"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null)
  const parsed = JobCreateSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const input: JobCreateInput = parsed.data
  const hasAnyImage = Boolean(input.imageBase64) || (Array.isArray(input.imageBase64s) && input.imageBase64s.length > 0)
  if (input.mode === "txt2img" && hasAnyImage) {
    return NextResponse.json({ error: "txt2img does not accept image/mask" }, { status: 400 })
  }
  if (input.mode === "img2img" && !hasAnyImage) {
    return NextResponse.json({ error: "img2img requires imageBase64" }, { status: 400 })
  }
  const job = jobStore.createJob(input)
  queueMicrotask(() => jobStore.runJob(job.id))
  return NextResponse.json({ jobId: job.id })
}
