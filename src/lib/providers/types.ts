export interface CommonParams {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  steps?: number
  cfg?: number
  sampler?: string
  seed?: number
  imageBase64?: string
  maskBase64?: string
  strength?: number
  signal?: AbortSignal
}

export interface NormalizedImage {
  base64?: string
  url?: string
  format?: string
  seed?: number
}

