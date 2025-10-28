import { ModelId } from "@/lib/jobTypes"

export type ProviderKind = "seedream" | "nano" | "flux" | "qwen"

export interface ModelInfo {
  id: ModelId
  provider: ProviderKind
  displayName: string
  defaultModelName: string
  endpointEnvVar: string
  mode: "txt2img" | "img2img"
}

export const MODELS: Record<ModelId, ModelInfo> = {
  seedream_t2i: {
    id: "seedream_t2i",
    provider: "seedream",
    displayName: "Seedream v4 Text-to-Image",
    defaultModelName: "bytedance/seedream-v4-text-to-image",
    endpointEnvVar: "KIE_SEEDREAM_T2I_ENDPOINT",
    mode: "txt2img"
  },
  seedream_edit: {
    id: "seedream_edit",
    provider: "seedream",
    displayName: "Seedream v4 Edit",
    defaultModelName: "bytedance/seedream-v4-edit",
    endpointEnvVar: "KIE_SEEDREAM_EDIT_ENDPOINT",
    mode: "img2img"
  },
  nano_t2i: {
    id: "nano_t2i",
    provider: "nano",
    displayName: "Nano Banana Text-to-Image",
    defaultModelName: "google/nano-banana",
    endpointEnvVar: "KIE_NANOBANANA_T2I_ENDPOINT",
    mode: "txt2img"
  },
  nano_edit: {
    id: "nano_edit",
    provider: "nano",
    displayName: "Nano Banana Edit",
    defaultModelName: "google/nano-banana-edit",
    endpointEnvVar: "KIE_NANOBANANA_EDIT_ENDPOINT",
    mode: "img2img"
  },
  flux_kontext: {
    id: "flux_kontext",
    provider: "flux",
    displayName: "Flux.1 Kontext",
    defaultModelName: "black-forest-labs/FLUX.1-dev",
    endpointEnvVar: "KIE_FLUX1_KONTEXT_ENDPOINT",
    mode: "txt2img"
  },
  qwen_edit: {
    id: "qwen_edit",
    provider: "qwen",
    displayName: "Qwen Image Edit",
    defaultModelName: "qwen/image-edit",
    endpointEnvVar: "KIE_QWEN_IMAGE_EDIT_ENDPOINT",
    mode: "img2img"
  }
}

