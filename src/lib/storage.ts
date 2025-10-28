import { mkdir, writeFile, readFile, stat } from "node:fs/promises"
import path from "node:path"

export const OUTPUT_ROOT = path.join(process.cwd(), "outputs")

export async function ensureDir(dir: string) {
  try {
    const s = await stat(dir)
    if (s.isDirectory()) return
  } catch {
    await mkdir(dir, { recursive: true })
  }
}

export async function saveBuffer(filePath: string, buf: Buffer) {
  const dir = path.dirname(filePath)
  await ensureDir(dir)
  await writeFile(filePath, buf)
}

export async function saveJson(filePath: string, data: unknown) {
  const dir = path.dirname(filePath)
  await ensureDir(dir)
  await writeFile(filePath, Buffer.from(JSON.stringify(data, null, 2)))
}

export async function readLocalFile(filePath: string) {
  return readFile(filePath)
}

