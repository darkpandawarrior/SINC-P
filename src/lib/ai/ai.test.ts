import { afterEach, describe, expect, it } from 'vitest'
import { __setAiProviderForTests, isModelBacked, parseJsonObject, type AiProvider } from './provider'
import { clampForModel, prepareForModel, redact } from './redact'
import { CONFIDENCE_FLOOR, detectUrgency, suggestTriage } from './triage'
import { clusterGrievances, findRelated, similarity, terms } from './clusters'
import type { Category } from '@/db/schema'

const cat = (id: string, name: string): Category =>
  ({
    id,
    institutionId: 'inst',
    parentId: null,
    name,
    description: null,
    slaResolutionDays: null,
    isSensitive: false,
    sortOrder: 0,
    isActive: true,
  }) as Category

const CATEGORIES = [
  cat('c1', 'Mess Food Quality'),
  cat('c2', 'Room Allotment & Maintenance'),
  cat('c3', 'Fees & Scholarship'),
  cat('c4', 'Ragging & Harassment'),
  cat('c5', 'Library'),
]

afterEach(() => __setAiProviderForTests(undefined))

describe('redaction', () => {
  it('removes the Indian identifiers a generic scrubber misses', () => {
    const { text, removed } = redact(
      'Contact Priya on +91 98765 43210 or priya@nitb.ac.in, Aadhaar 1234 5678 9012, PAN ABCDE1234F, roll 171112003.',
    )
    expect(text).not.toMatch(/9876543210|98765 43210/)
    expect(text).not.toContain('priya@nitb.ac.in')
    expect(text).not.toContain('1234 5678 9012')
    expect(text).not.toContain('ABCDE1234F')
    expect(text).toContain('[phone]')
    expect(text).toContain('[email]')
    expect(text).toContain('[aadhaar]')
    expect(text).toContain('[pan]')
    // The audit record counts kinds, never values.
    expect(Object.values(removed).every((n) => typeof n === 'number')).toBe(true)
    expect(JSON.stringify(removed)).not.toContain('9876')
  })

  it('leaves ordinary grievance text alone', () => {
    const body = 'The dinner mess served undercooked rice for three days and nobody responded.'
    expect(redact(body).text).toBe(body)
  })

  it('redacts before truncating, so a clamp cannot expose half a number', () => {
    // Truncating first could cut "+91 98765 43210" down to "+91 98765", which no longer
    // matches the phone pattern and would ship as plain text.
    const long = `${'padding word '.repeat(90)}call me on +91 98765 43210 now`
    const { text } = prepareForModel(long, 1210)
    expect(text).not.toMatch(/98765/)
  })

  it('clamps on a word boundary rather than mid-word', () => {
    const out = clampForModel('alpha beta gamma delta epsilon', 20)
    expect(out.endsWith('…')).toBe(true)
    // The tail must stay readable: no truncation halfway through a word.
    expect(out).not.toMatch(/gamm…$/)
    expect(out.replace('…', '').trim().split(' ').every((w) => 'alpha beta gamma delta epsilon'.split(' ').includes(w))).toBe(true)
  })
})

describe('urgency detection', () => {
  it('flags the categories that must not wait in a queue', () => {
    for (const text of [
      'seniors have been ragging first years after curfew',
      'I am being harassed and feel unsafe in the hostel',
      'there was a short circuit in the corridor',
      'he threatened me when I refused',
    ]) {
      expect(detectUrgency(text).urgent).toBe(true)
    }
  })

  it('does not flag routine grievances', () => {
    expect(detectUrgency('the library card reader is not working').urgent).toBe(false)
    expect(detectUrgency('scholarship has not been credited yet').urgent).toBe(false)
  })

  it('gives a reason an officer can act on', () => {
    expect(detectUrgency('this feels like ragging to me').reason).toBe('possible ragging')
  })
})

describe('triage without a model', () => {
  it('suggests a category from keywords alone', async () => {
    const s = await suggestTriage(
      { subject: 'Mess food is inedible', body: 'The mess served stale food again.' },
      CATEGORIES,
    )
    expect(s.source).toBe('heuristic')
    expect(s.categoryName).toBe('Mess Food Quality')
    expect(s.confidence).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR)
  })

  it('says nothing rather than guessing badly', async () => {
    // A wrong pre-selection gets accepted by a tired moderator and ends up in the
    // compliance report, so silence is the safer failure.
    const s = await suggestTriage(
      { subject: 'Something happened', body: 'Please look into this.' },
      CATEGORIES,
    )
    expect(s.categoryId).toBeNull()
    expect(s.confidence).toBe(0)
  })

  it('still flags urgency with no model configured', async () => {
    const s = await suggestTriage(
      { subject: 'Ragging in the hostel', body: 'Seniors are calling first years out at night.' },
      CATEGORIES,
    )
    expect(s.urgent).toBe(true)
    expect(isModelBacked()).toBe(false)
  })
})

describe('triage with a model', () => {
  const fake = (text: string): AiProvider => ({
    name: 'openai-compatible',
    model: 'test-model',
    available: () => true,
    async complete() {
      return { text, model: 'test-model', provider: 'openai-compatible' }
    },
  })

  it('uses the model when it returns a category from the list', async () => {
    __setAiProviderForTests(fake('{"category":"Fees & Scholarship","confidence":0.9,"urgent":false}'))
    const s = await suggestTriage({ subject: 'Money', body: 'Not credited.' }, CATEGORIES)
    expect(s.source).toBe('model')
    expect(s.categoryName).toBe('Fees & Scholarship')
    expect(s.model).toBe('test-model')
  })

  it('ignores a category the model invented', async () => {
    __setAiProviderForTests(fake('{"category":"Cafeteria Vibes","confidence":0.99}'))
    const s = await suggestTriage({ subject: 'x', body: 'y' }, CATEGORIES)
    expect(s.categoryId).toBeNull()
  })

  it('withholds a low-confidence suggestion', async () => {
    __setAiProviderForTests(fake('{"category":"Library","confidence":0.2}'))
    const s = await suggestTriage({ subject: 'x', body: 'y' }, CATEGORIES)
    expect(s.categoryId).toBeNull()
  })

  it('never lets the model clear a locally raised urgency flag', async () => {
    // The keyword list is the floor. A model that decides ragging is routine must not be
    // able to send it to the back of the queue.
    __setAiProviderForTests(fake('{"category":"Library","confidence":0.9,"urgent":false}'))
    const s = await suggestTriage(
      { subject: 'Ragging complaint', body: 'Seniors ragging first years.' },
      CATEGORIES,
    )
    expect(s.urgent).toBe(true)
  })

  it('falls back to keywords when the provider throws', async () => {
    __setAiProviderForTests({
      name: 'openai-compatible',
      model: 'broken',
      available: () => true,
      async complete() {
        throw new Error('connection refused')
      },
    })
    const s = await suggestTriage(
      { subject: 'Mess food', body: 'Stale mess food again.' },
      CATEGORIES,
    )
    // A filing form must not fail because an inference server is unreachable.
    expect(s.source).toBe('heuristic')
    expect(s.categoryName).toBe('Mess Food Quality')
  })

  it('survives a model that returns prose instead of JSON', async () => {
    __setAiProviderForTests(fake('Certainly! I think this belongs in the Library category.'))
    const s = await suggestTriage({ subject: 'x', body: 'y' }, CATEGORIES)
    expect(s.categoryId).toBeNull()
  })

  it('reads JSON out of a fenced block', () => {
    const parsed = parseJsonObject<{ category: string }>(
      '```json\n{"category":"Library"}\n```',
    )
    expect(parsed?.category).toBe('Library')
  })
})

describe('clustering', () => {
  const at = (d: number) => new Date(Date.UTC(2026, 7, d))
  const g = (id: string, subject: string, body: string, day: number, categoryId = 'c1') => ({
    id,
    subject,
    body,
    categoryId,
    createdAt: at(day),
  })

  it('groups many reports of one underlying problem', () => {
    const clusters = clusterGrievances([
      g('1', 'Stale food in mess', 'The mess served stale rice at dinner again', 1),
      g('2', 'Mess dinner stale', 'Stale rice served in the mess at dinner', 2),
      g('3', 'Mess food quality poor', 'Dinner rice in the mess was stale', 3),
      g('4', 'Library card broken', 'The library card reader stopped working', 4, 'c5'),
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.members).toHaveLength(3)
    expect(clusters[0]!.members).not.toContain('4')
    expect(clusters[0]!.terms).toContain('mess')
  })

  it('needs at least three before calling something systemic', () => {
    // Two similar grievances are a coincidence. The point of this feature is to find the
    // thing worth telling a Registrar about.
    expect(
      clusterGrievances([
        g('1', 'Stale mess food', 'stale rice mess dinner', 1),
        g('2', 'Stale mess food', 'stale rice mess dinner', 2),
      ]),
    ).toHaveLength(0)
  })

  it('puts the largest cluster first', () => {
    const clusters = clusterGrievances([
      g('1', 'mess stale rice', 'mess stale rice dinner', 1),
      g('2', 'mess stale rice', 'mess stale rice dinner', 2),
      g('3', 'mess stale rice', 'mess stale rice dinner', 3),
      g('4', 'mess stale rice', 'mess stale rice dinner', 4),
      g('5', 'hostel fan broken', 'ceiling fan hostel room broken', 5, 'c2'),
      g('6', 'hostel fan broken', 'ceiling fan hostel room broken', 6, 'c2'),
      g('7', 'hostel fan broken', 'ceiling fan hostel room broken', 7, 'c2'),
    ])
    expect(clusters[0]!.members.length).toBeGreaterThanOrEqual(clusters[1]!.members.length)
  })

  it('orders members most recent first', () => {
    const clusters = clusterGrievances([
      g('old', 'mess stale rice', 'mess stale rice dinner', 1),
      g('new', 'mess stale rice', 'mess stale rice dinner', 9),
      g('mid', 'mess stale rice', 'mess stale rice dinner', 5),
    ])
    expect(clusters[0]!.members[0]).toBe('new')
  })

  it('only claims a category when the members agree', () => {
    const mixed = clusterGrievances([
      g('1', 'mess stale rice', 'mess stale rice dinner', 1, 'c1'),
      g('2', 'mess stale rice', 'mess stale rice dinner', 2, 'c2'),
      g('3', 'mess stale rice', 'mess stale rice dinner', 3, 'c1'),
    ])
    expect(mixed[0]!.categoryId).toBeNull()
  })

  it('finds likely duplicates of a new filing', () => {
    const related = findRelated(
      { subject: 'Mess serving stale food', body: 'stale rice at dinner in the mess' },
      [
        g('1', 'Stale mess dinner', 'the mess served stale rice at dinner', 1),
        g('2', 'Library card', 'library card reader broken', 2, 'c5'),
      ],
    )
    expect(related.map((r) => r.id)).toEqual(['1'])
  })

  it('scores identical text at 1 and unrelated text at 0', () => {
    expect(similarity(terms('mess stale rice'), terms('mess stale rice'))).toBe(1)
    expect(similarity(terms('mess stale rice'), terms('library card reader'))).toBe(0)
  })

  it('drops numbers so dates and room numbers do not fake a match', () => {
    expect(terms('room 214 on 14th August').has('214')).toBe(false)
  })
})
