# Repository Guidelines

## Project Structure & Module Organization
- `src/app`: Next.js routes and server handlers (e.g., `api/jobs`, SSE events, file serving).
- `src/lib`: Core logic.
  - `providers/`: Model adapters (`nano.ts`, `seedream.ts`, `qwen.ts`, `flux.ts`) and helpers (`kieClient.ts`, `kieJobs.ts`, `uploader.ts`, `types.ts`, `models.ts`).
  - `jobManager.ts`, `jobTypes.ts`, `storage.ts`: Orchestration, type definitions, and output persistence.
- `outputs/<jobId>/...`: Generated images and metadata written at runtime.
- Root: `.env.example` (copy to `.env.local`), `README.md`, Next.js config and package files.

## Build, Test, and Development Commands
- `npm install`: Install dependencies.
- `npm run dev`: Start local dev server (http://localhost:3000).
- `npm run build`: Production build (type-check + optimize).
- `npm run start`: Run the production server.
Notes:
- Configure `.env.local` with `KIE_API_KEY` and endpoints (see README). Do not commit secrets.

## Coding Style & Naming Conventions
- Language: TypeScript (prefer explicit types for exported APIs).
- Indentation: 2 spaces; keep functions small and focused.
- Naming: `lowerCamelCase` for variables/functions; `PascalCase` for types/interfaces; files in `providers/` are lowercase model names (e.g., `nano.ts`).
- Avoid one-letter variables, noisy comments, and dead code. Keep changes minimal and targeted.

## Testing Guidelines
- No test harness is bundled. If adding tests, use Jest or Vitest:
  - Place tests under `src/__tests__/` with `*.test.ts`.
  - Prefer unit tests for providers and helpers; mock network calls.
- Manual checks: run `npm run dev`, start a job, and verify images/metadata in `outputs/<jobId>/...`.

## Commit & Pull Request Guidelines
- Commits: imperative mood, concise subject, focused scope (e.g., `providers/nano: add jobs flow`).
- PRs: include a clear description, rationale, and screenshots/logs if UI or API behavior changes.
- Link related issues, note breaking changes, and describe manual test steps.

## Security & Configuration Tips
- Never commit `.env.local` or API keys. Use `.env.example` for placeholders.
- Edit flows auto-upload base64 images to a temporary host; validate URLs before use.
- Respect service limits and timeouts; avoid broad concurrency changes without discussion.

