import { NextRequest } from "next/server"
import { jobStore } from "@/lib/jobManager"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id
  const job = jobStore.getJob(id)
  if (!job) {
    return new Response("not found", { status: 404 })
  }
  let unsub: (() => void) | null = null
  let keepalive: NodeJS.Timeout | null = null
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const push = (event: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      unsub = jobStore.subscribe(id, push)
      push({ type: "job_start", job })
      keepalive = setInterval(() => controller.enqueue(encoder.encode(`: keepalive\n\n`)), 15000)
      controller.enqueue(encoder.encode(`retry: 5000\n\n`))
      controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`))
    },
    cancel() {
      if (keepalive) clearInterval(keepalive)
      if (unsub) unsub()
    }
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  })
}
