export async function optimizePrompt(
  original: string,
  signal?: AbortSignal,
  modelOverride?: string,
  numResponsesOverride?: number
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY || ""
  const model = modelOverride || process.env.OPENROUTER_MODEL || "openai/gpt-5"
  if (!apiKey || !original.trim()) return original
  try {
    const numResponses = typeof numResponsesOverride === "number" && numResponsesOverride > 0 ? numResponsesOverride : 3
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        // Optional best-practice headers. Replace or remove if undesired.
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Gacha Images Prompt Optimizer"
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a prompt optimizer for AI image generation.

Your task is to generate multiple optimized prompts for a given user query.  
Each optimized prompt should be clear, expressive, creative, and suitable for high-quality AI image generation — but never overly long or complicated.

You must **strictly preserve the intent, meaning, and all essential details of the user's input**.  
The optimized prompts **must not contradict, distort, omit, or add information inconsistent with the user_query**.  
Do not include or imply any parameters related to image ratio, canvas size, aspect ratio, or framing.

You should focus on enhancing clarity, tone, and visual richness **without changing or losing original meaning**.

The **output language must always match the language of the user_query** — if the user input is in Chinese, output in Chinese; if in English, output in English, and so on.

You must output a strictly valid JSON object that can be parsed by TypeScript using JSON.parse().  
Do not include any explanations, markdown formatting, or text outside of the JSON.

You will receive:
- \`user_query\`: the original user input.
- \`numResponses\`: an integer specifying how many optimized prompts to generate.

Each item in the "responses" array must include:
- "text": a string representing the optimized prompt.
- "probability": a floating-point number between 0 and 1 representing its relative likelihood or weight.

### Output format (must match exactly):
{
  "responses": [
    {
      "text": "string",
      "probability": number
    }
  ]
}
`
          },
          {
            role: "user",
            content: JSON.stringify({
              user_query: original,
              numResponses
            })
          }
        ]
      }),
      signal
    })
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}`)
    const json = (await res.json().catch(() => ({}))) as any
    const content = json?.choices?.[0]?.message?.content
    if (typeof content === "string" && content.trim()) {
      try {
        const parsed = JSON.parse(content)
        const arr = Array.isArray(parsed?.responses) ? parsed.responses : []
        if (arr.length > 0) {
          // pick the highest probability, fallback to first
          let best = arr[0]
          if (arr.length > 1) {
            best = arr.reduce((a: any, b: any) =>
              (typeof a?.probability === "number" ? a.probability : 0) >= (typeof b?.probability === "number" ? b.probability : 0) ? a : b
            )
          }
          const text = typeof best?.text === "string" && best.text.trim() ? best.text.trim() : null
          if (text) return text
        }
      } catch {
        // fall through to return original
      }
    }
    return original
  } catch {
    return original
  }
}

export async function optimizePrompts(
  original: string,
  signal?: AbortSignal,
  modelOverride?: string,
  numResponsesOverride?: number
): Promise<string[]> {
  // Reuse optimizePrompt pipeline but parse all
  const apiKey = process.env.OPENROUTER_API_KEY || ""
  const model = modelOverride || process.env.OPENROUTER_MODEL || "openai/gpt-5"
  if (!apiKey || !original.trim()) return [original]
  try {
    const numResponses = typeof numResponsesOverride === "number" && numResponsesOverride > 0 ? numResponsesOverride : 3
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Gacha Images Prompt Optimizer"
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a prompt optimizer for AI image generation.

Your task is to generate multiple optimized prompts for a given user query.  
Each optimized prompt should be creative, diverse, and suitable for high-quality AI image generation.

You must output a strictly valid JSON object that can be parsed by TypeScript using JSON.parse().  
Do not include any explanations, markdown formatting, or text outside of the JSON.

You will receive:
- \`user_query\`: the original user input.
- \`numResponses\`: an integer specifying how many optimized prompts to generate.

Each item in the "responses" array must include:
- "text": a string representing the optimized prompt (50–100 words recommended).
- "probability": a floating-point number between 0 and 1 representing its relative likelihood or weight.

### Output format (must match exactly):
{
  "responses": [
    {
      "text": "string",
      "probability": number
    }
  ]
}`
          },
          {
            role: "user",
            content: JSON.stringify({
              user_query: original,
              numResponses
            })
          }
        ]
      }),
      signal
    })
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}`)
    const json = (await res.json().catch(() => ({}))) as any
    const content = json?.choices?.[0]?.message?.content
    if (typeof content === "string" && content.trim()) {
      try {
        const parsed = JSON.parse(content)
        const arr = Array.isArray(parsed?.responses) ? parsed.responses : []
        if (arr.length > 0) {
          const sorted = arr
            .slice()
            .sort((a: any, b: any) => (Number(b?.probability) || 0) - (Number(a?.probability) || 0))
            .map((x: any) => (typeof x?.text === "string" ? x.text.trim() : ""))
            .filter((t: string) => !!t)
          if (sorted.length > 0) return sorted
        }
      } catch {
        // ignore
      }
    }
    return [original]
  } catch {
    return [original]
  }
}
