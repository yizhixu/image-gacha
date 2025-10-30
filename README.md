# AI Gacha Images (Web, TypeScript)

A Next.js 14 + TypeScript web app to orchestrate multi-model image generation via Kie.ai (Seedream, Nano Banana, Flux.1 Kontext, Qwen Image Edit). Choose one or more models, set per-model counts, and run fully concurrent generation (no artificial concurrency cap).

## Features
- Text-to-Image and Image-to-Image (edit) modes.
- Select multiple models with per-model image counts.
- Full concurrency: one HTTP request per image, all fired together.
- Live progress via SSE, cancel and retry failed items.
- Saves images and metadata to `outputs/<jobId>/...`.
- File-serving route to view images in the browser.

## Quick Start
1. Copy `.env.example` to `.env.local` and fill values:
   - `KIE_API_KEY` (server-side only)
   - Endpoint overrides per model if needed (`KIE_*_ENDPOINT`).
2. Install deps and run:
   - `npm install`
   - `npm run dev`
3. Open `http://localhost:3000`.

## Kie.ai Endpoints
Endpoints vary by product and model. This repo keeps them configurable via environment variables:
- `KIE_BASE_URL`
- `KIE_SEEDREAM_T2I_ENDPOINT`
- `KIE_SEEDREAM_EDIT_ENDPOINT`
- `KIE_NANOBANANA_T2I_ENDPOINT`
- `KIE_NANOBANANA_EDIT_ENDPOINT`
- `KIE_FLUX1_KONTEXT_ENDPOINT`
- `KIE_QWEN_IMAGE_EDIT_ENDPOINT`
- `KIE_FILE_BASE64_UPLOAD_ENDPOINT` (optional, defaults to `https://kieai.redpandaai.co/api/file-base64-upload`)

Set each to the exact API endpoint for your account and plan. For Nano Banana / Seedream / Qwen Image Edit, requests go through the unified jobs API (`POST /api/v1/jobs/createTask` + `GET /api/v1/jobs/recordInfo`). Flux.1 Kontext uses its product endpoint (`/api/v1/flux/kontext/*`).

If you pass base64 images for edit models, the server will auto-upload them to temporary storage via `KIE_FILE_BASE64_UPLOAD_ENDPOINT` and then send the resulting URL to the model.

## Development Notes
- This app is intended for serverful Node.js (filesystem access). If deploying serverless, replace file writes and file-serving routes.
- Concurrency is intentionally unconstrained; ensure your Kie.ai rate limits and quotas match your usage.
- Large image payloads are sent from the browser to the server as base64 in JSON. Adjust limits as needed.

## Scripts
- `npm run dev` – Start dev server
- `npm run build` – Build for production
- `npm run start` – Run production server
