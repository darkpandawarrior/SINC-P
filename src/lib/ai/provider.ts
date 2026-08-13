/**
 * The AI seam.
 *
 * Four rules govern everything under `src/lib/ai/`, and they are product decisions rather
 * than technical ones:
 *
 *  1. **Off by default.** `AI_PROVIDER` unset means the heuristic provider: deterministic,
 *     local, no network, no model. Every feature still works, slightly worse. An
 *     institution opts in to a model deliberately or not at all.
 *
 *  2. **Nothing decides.** The AI suggests a category, flags a possible duplicate, warns
 *     that text looks urgent. A human sets every status. There is no code path where a
 *     model changes a grievance's outcome, and there should never be one: a student whose
 *     complaint was closed by a language model has a grievance about the grievance system.
 *
 *  3. **Every suggestion is auditable.** Which provider, which model, what confidence,
 *     what it said. A Registrar asked "why was this categorised as Hostel" needs an
 *     answer better than "the computer thought so".
 *
 *  4. **Text is redacted before it leaves the machine.** Grievances contain names, roll
 *     numbers and phone numbers, and under the DPDP Act shipping those to a third-party
 *     endpoint is a decision an institution must make knowingly. See `redact.ts`.
 *
 * The remote provider speaks the OpenAI chat-completions shape because that is what
 * Ollama, vLLM, llama.cpp and every hosted vendor already serve. Pointing `AI_BASE_URL`
 * at a box in the college's own server room is the intended production configuration,
 * not an afterthought.
 */

export interface AiCompletion {
  text: string
  model: string
  provider: string
}

export interface AiProvider {
  name: string
  model: string
  /** Available means "will answer", not "is configured". */
  available(): boolean
  complete(prompt: string, opts?: { maxTokens?: number; temperature?: number }): Promise<AiCompletion>
}

export class AiUnavailableError extends Error {}

/**
 * The always-present fallback: no model, no network, no inference.
 *
 * It exists so every caller can be written one way. Features that would degrade to
 * nothing degrade to a keyword match instead, which is worse than a good model and much
 * better than an empty screen, and it means the demo works on a laptop with no GPU and
 * no API key.
 */
const heuristicProvider: AiProvider = {
  name: 'heuristic',
  model: 'none',
  available: () => true,
  async complete() {
    // Callers must check `isModelBacked()` before asking for free text. Reaching here
    // means someone wired a generative feature without a fallback path.
    throw new AiUnavailableError(
      'the heuristic provider does not generate text; guard generative features with isModelBacked()',
    )
  },
}

function remoteProvider(): AiProvider {
  const baseUrl = (process.env.AI_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '')
  const model = process.env.AI_MODEL ?? 'llama3.1:8b'
  const apiKey = process.env.AI_API_KEY
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 20_000)

  return {
    name: 'openai-compatible',
    model,
    available: () => true,
    async complete(prompt, opts = {}) {
      // A grievance queue must not hang because a model is thinking. Every caller treats
      // a timeout as "no suggestion", never as an error the user sees.
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: opts.maxTokens ?? 400,
          // Near-zero by default: this is classification, not writing. A category
          // suggestion that varies between two identical grievances is worse than useless
          // in a system whose selling point is a defensible record.
          temperature: opts.temperature ?? 0,
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!res.ok) {
        throw new AiUnavailableError(`AI provider returned ${res.status}`)
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = json.choices?.[0]?.message?.content
      if (typeof text !== 'string') throw new AiUnavailableError('AI provider returned no content')

      return { text, model, provider: 'openai-compatible' }
    },
  }
}

let cached: AiProvider | undefined

export function getAiProvider(): AiProvider {
  if (!cached) {
    cached = process.env.AI_PROVIDER === 'openai-compatible' ? remoteProvider() : heuristicProvider
  }
  return cached
}

/** True when a real model is configured. Generative features must check this first. */
export function isModelBacked(): boolean {
  return getAiProvider().name !== 'heuristic'
}

export function __setAiProviderForTests(p: AiProvider | undefined): void {
  cached = p
}

/**
 * Parse a JSON object out of a model response.
 *
 * Models wrap JSON in prose and fences however they are asked not to. Returning null on
 * anything unparseable is deliberate: a malformed suggestion becomes no suggestion, which
 * is a state the UI already handles, rather than an exception on a page a student is
 * waiting for.
 */
export function parseJsonObject<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced?.[1] ?? text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
