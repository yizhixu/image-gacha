import { readLocalFile, OUTPUT_ROOT } from "@/lib/storage"
import path from "node:path"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { id: string; path: string[] } }) {
  const id = params.id
  const rest = params.path.join("/")
  const abs = path.join(OUTPUT_ROOT, id, rest)
  try {
    const data = await readLocalFile(abs)
    const ext = path.extname(abs).toLowerCase()
    const type = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "application/octet-stream"
    return new Response(data, { headers: { "Content-Type": type, "Cache-Control": "no-cache" } })
  } catch {
    return new Response("not found", { status: 404 })
  }
}

