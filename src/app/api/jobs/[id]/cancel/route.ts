import { NextRequest, NextResponse } from "next/server"
import { jobStore } from "@/lib/jobManager"

export const runtime = "nodejs"

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  const job = jobStore.getJob(id)
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 })
  await jobStore.cancelJob(id)
  return NextResponse.json({ ok: true })
}

