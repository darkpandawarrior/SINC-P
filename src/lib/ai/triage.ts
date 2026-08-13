/**
 * Triage assistance: suggest a category, and flag text that should not wait in a queue.
 *
 * The council's highest-probability failure was that filing gets easier for students
 * while the Registrar's day gets worse, and the Registrar then tells students to just
 * email instead. Triage is where that day is won or lost: a moderator reading forty
 * grievances and picking a category for each is the dullest, most skippable work in the
 * product, and the first thing to be abandoned under pressure.
 *
 * So this suggests. It never sets. The moderator sees a pre-selected category with a
 * visible "suggested" marker and changes it in one click when it is wrong, and the
 * suggestion plus its confidence goes into the audit trail either way.
 *
 * The urgency flag is the part that matters more than convenience. A grievance whose text
 * suggests ragging, harassment, or a student at risk should not sit in a queue behind a
 * library card, and a moderator who is three hours behind should not be the only thing
 * standing between that text and an officer.
 */
import type { Category } from '@/db/schema'
import { getAiProvider, isModelBacked, parseJsonObject } from './provider'
import { prepareForModel } from './redact'

export interface TriageSuggestion {
  categoryId: string | null
  categoryName: string | null
  /** 0 to 1. Below CONFIDENCE_FLOOR the suggestion is withheld entirely. */
  confidence: number
  urgent: boolean
  /** Why it was flagged urgent, for the officer, not for the student. */
  urgencyReason: string | null
  source: 'heuristic' | 'model'
  model: string
}

/**
 * Below this, say nothing.
 *
 * A wrong pre-selection is worse than no pre-selection: it gets accepted by a tired
 * moderator, and then the category is wrong in the compliance report that the whole
 * product exists to produce.
 */
export const CONFIDENCE_FLOOR = 0.45

/**
 * Words that mean "do not let this wait".
 *
 * Deliberately broad and deliberately not clever. A false positive costs an officer a
 * glance at something that turned out to be routine. A false negative is a ragging case
 * sitting unread for two days. Those costs are not symmetric, so neither is this list.
 */
const URGENT_TERMS: Array<{ term: RegExp; reason: string }> = [
  { term: /\brag(ging|ged)?\b/i, reason: 'possible ragging' },
  { term: /\bharass(ment|ed|ing)?\b/i, reason: 'possible harassment' },
  { term: /\bmolest|assault|abuse[ds]?\b/i, reason: 'possible assault or abuse' },
  { term: /\bthreat(en(ed|ing)?|s)?\b/i, reason: 'threat reported' },
  { term: /\bsuicid|self.?harm|end my life|kill myself\b/i, reason: 'possible risk to life' },
  { term: /\bcaste|communal|religio(n|us) (slur|abuse)\b/i, reason: 'possible discrimination' },
  { term: /\bunsafe|not safe|afraid|scared|retaliat/i, reason: 'student reports fear' },
  { term: /\bhospital|injur(y|ed)|bleeding|unconscious\b/i, reason: 'possible injury' },
  { term: /\bfire|electric shock|short circuit|gas leak\b/i, reason: 'possible safety hazard' },
]

export function detectUrgency(text: string): { urgent: boolean; reason: string | null } {
  for (const { term, reason } of URGENT_TERMS) {
    if (term.test(text)) return { urgent: true, reason }
  }
  return { urgent: false, reason: null }
}

/**
 * Keyword scoring against the institution's own category names.
 *
 * No model, no network, and it works on the first day before anyone has configured
 * anything. Scores a category by how many of its own words appear in the grievance,
 * weighted so a match on a specific two-word category ("Mess Food Quality") beats an
 * incidental match on a common one.
 */
function heuristicCategory(
  text: string,
  categories: Category[],
): { category: Category | null; confidence: number } {
  const haystack = text.toLowerCase()
  let best: { category: Category; score: number } | null = null

  for (const category of categories) {
    const words = category.name
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    if (words.length === 0) continue

    let hits = 0
    for (const word of words) {
      // Prefix match rather than exact: "scholarship" should hit on "scholarships",
      // "examination" on "exam".
      if (haystack.includes(word) || haystack.includes(word.slice(0, Math.max(4, word.length - 2)))) {
        hits += 1
      }
    }
    if (hits === 0) continue

    const score = hits / words.length
    if (!best || score > best.score) best = { category, score }
  }

  if (!best) return { category: null, confidence: 0 }
  // A single-word category match is weaker evidence than matching every word of a
  // two-word one, and the ceiling stays below 1 because keywords are never certain.
  return { category: best.category, confidence: Math.min(0.8, best.score * 0.8) }
}

const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'from', 'into', 'other', 'general'])

interface ModelTriage {
  category?: string
  confidence?: number
  urgent?: boolean
  reason?: string
}

/**
 * Suggest a category and an urgency flag for one grievance.
 *
 * Never throws. A model that is down, slow, or talking nonsense degrades to the keyword
 * path, because a filing form that fails because an inference server is unreachable is a
 * filing form that loses grievances.
 */
export async function suggestTriage(
  input: { subject: string; body: string },
  categories: Category[],
): Promise<TriageSuggestion> {
  const raw = `${input.subject}\n\n${input.body}`

  // Urgency is decided locally, always, whatever the provider. This must not depend on a
  // network call, and it must not be something an institution can turn off by leaving a
  // model unconfigured.
  const urgency = detectUrgency(raw)

  const fallback = (): TriageSuggestion => {
    const { category, confidence } = heuristicCategory(raw, categories)
    const usable = confidence >= CONFIDENCE_FLOOR
    return {
      categoryId: usable ? (category?.id ?? null) : null,
      categoryName: usable ? (category?.name ?? null) : null,
      confidence: usable ? confidence : 0,
      urgent: urgency.urgent,
      urgencyReason: urgency.reason,
      source: 'heuristic',
      model: 'none',
    }
  }

  if (!isModelBacked() || categories.length === 0) return fallback()

  try {
    const provider = getAiProvider()
    const { text } = prepareForModel(raw)
    const names = categories.map((c) => c.name)

    const completion = await provider.complete(
      [
        'You are triaging a student grievance at an Indian university.',
        'Choose exactly one category from this list, copied verbatim:',
        names.map((n) => `- ${n}`).join('\n'),
        '',
        'Grievance:',
        '"""',
        text,
        '"""',
        '',
        'Reply with only a JSON object:',
        '{"category": "<one name from the list>", "confidence": <0 to 1>, "urgent": <true|false>, "reason": "<short reason if urgent, else null>"}',
        '',
        'Set urgent to true only for ragging, harassment, discrimination, threats, risk to life, injury, or a safety hazard.',
        'If the grievance does not clearly fit any category, set confidence below 0.4.',
      ].join('\n'),
      { maxTokens: 200 },
    )

    const parsed = parseJsonObject<ModelTriage>(completion.text)
    if (!parsed) return fallback()

    // The model is told to copy a name verbatim and sometimes will not, so match back
    // against the real list rather than trusting the string.
    const matched =
      categories.find((c) => c.name.toLowerCase() === String(parsed.category ?? '').toLowerCase()) ??
      null

    const confidence = clamp01(Number(parsed.confidence ?? 0))
    const usable = matched !== null && confidence >= CONFIDENCE_FLOOR

    return {
      categoryId: usable ? matched.id : null,
      categoryName: usable ? matched.name : null,
      confidence: usable ? confidence : 0,
      // Local detection wins. A model saying "not urgent" must never be able to clear a
      // flag the keyword list raised.
      urgent: urgency.urgent || parsed.urgent === true,
      urgencyReason: urgency.reason ?? (parsed.urgent === true ? (parsed.reason ?? 'model flagged') : null),
      source: 'model',
      model: completion.model,
    }
  } catch {
    return fallback()
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}
