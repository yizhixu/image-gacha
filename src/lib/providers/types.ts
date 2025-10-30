export interface CommonParams {
  prompt: string
  resolution?: "1K" | "2K" | "4K"
  aspect?: "21:9" | "16:9" | "9:16"
  seed?: number
  imageBase64?: string
  imageBase64s?: string[]
  signal?: AbortSignal
}

export interface NormalizedImage {
  base64?: string
  url?: string
  format?: string
  seed?: number
}
