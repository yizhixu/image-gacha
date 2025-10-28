import { customAlphabet } from "nanoid"

export const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12)

export async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string) || "")
    reader.onerror = (e) => reject(e)
    reader.readAsDataURL(file)
  })
}

