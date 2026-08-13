/**
 * Strip identifying detail out of grievance text before a model sees it.
 *
 * The threat is not a malicious provider. It is the ordinary case: an institution points
 * `AI_BASE_URL` at a hosted endpoint, and a grievance that names a student, a warden and
 * a phone number is now in someone else's logs. Under the DPDP Act that is the
 * institution's problem, and the software should make it much harder to do by accident.
 *
 * This is a reducer of risk, not a guarantee. A grievance body that says "the warden of
 * Block C on the night of the 14th" identifies a person no regular expression will catch.
 * That is exactly why the remote provider is off by default and why the documentation
 * says to run the model on the institution's own hardware.
 *
 * Indian formats specifically: Aadhaar, PAN, and 10-digit mobile numbers, none of which
 * a generic PII stripper written elsewhere looks for.
 */

export interface RedactionResult {
  text: string
  /** What was removed, by kind, for the audit record. Never the values themselves. */
  removed: Record<string, number>
}

interface Rule {
  kind: string
  pattern: RegExp
  replacement: string
}

const RULES: Rule[] = [
  { kind: 'email', pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: '[email]' },
  // Aadhaar before the generic number rules, or the first four digits get eaten.
  { kind: 'aadhaar', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[aadhaar]' },
  { kind: 'pan', pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, replacement: '[pan]' },
  {
    kind: 'phone',
    // Indian mobiles start 6 to 9 and run ten digits, but people write them with a
    // space or a hyphen in the middle far more often than not ("98765 43210"), and a
    // pattern demanding ten contiguous digits sails straight past the common case.
    // The optional +91 has to be consumed too, or the prefix survives the redaction.
    pattern: /(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g,
    replacement: '[phone]',
  },
  {
    kind: 'roll_number',
    // Roll and enrolment numbers vary by institution; this catches the common shape of
    // letters followed by six or more digits, e.g. 171112003.
    pattern: /\b[A-Z]{0,4}\d{6,12}\b/gi,
    replacement: '[roll]',
  },
  { kind: 'url', pattern: /\bhttps?:\/\/\S+/gi, replacement: '[url]' },
  {
    kind: 'account',
    pattern: /\b\d{9,18}\b/g,
    replacement: '[account]',
  },
]

export function redact(input: string): RedactionResult {
  const removed: Record<string, number> = {}
  let text = input

  for (const rule of RULES) {
    text = text.replace(rule.pattern, () => {
      removed[rule.kind] = (removed[rule.kind] ?? 0) + 1
      return rule.replacement
    })
  }

  return { text, removed }
}

/**
 * Cap what is sent, separately from redaction.
 *
 * A 4,000 character grievance costs tokens and adds nothing to a category decision that
 * the first few hundred characters did not already settle. Truncating at a word boundary
 * keeps the tail readable rather than cutting mid-word.
 */
export function clampForModel(text: string, maxChars = 1200): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut}…`
}

/** Redact and clamp in the order that matters: redact first, so truncation can never
 *  split a phone number into something the pattern no longer matches. */
export function prepareForModel(text: string, maxChars?: number): RedactionResult {
  const { text: redacted, removed } = redact(text)
  return { text: clampForModel(redacted, maxChars), removed }
}
