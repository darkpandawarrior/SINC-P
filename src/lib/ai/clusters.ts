/**
 * Find the grievances that are really one grievance.
 *
 * Forty students complain about the mess in the same week. The queue shows forty cases,
 * each resolved separately by a different officer with a different remark, and the
 * compliance report shows forty closures and a healthy median. Nobody ever sees the
 * sentence that matters: *the mess has a problem*.
 *
 * That is the gap between a ticket tracker and something a Registrar runs an institution
 * with, and it is the one place where a 2026 rebuild does something a 2019 complaint box
 * could not have done at all.
 *
 * No embeddings and no vector database. Term overlap on a small corpus is cheap, it needs
 * no model, and an institution's open grievances number in the hundreds rather than the
 * millions. If that ever stops being true, this is the module to replace.
 */
import type { Grievance } from '@/db/schema'

export interface Cluster {
  /** Grievance ids, most recent first. */
  members: string[]
  /** The shared terms that put them together, for the officer to sanity-check. */
  terms: string[]
  /** Mean pairwise similarity, 0 to 1. */
  cohesion: number
  categoryId: string | null
}

export interface ClusterInput {
  id: string
  subject: string
  body: string
  categoryId: string | null
  createdAt: Date
}

/** Two grievances join a cluster above this. Tuned to be reluctant: a wrongly merged
 *  pair invites an officer to close two unrelated cases with one remark. */
export const SIMILARITY_FLOOR = 0.34
const MIN_CLUSTER_SIZE = 3

const STOPWORDS = new Set([
  'the','and','for','with','from','into','that','this','have','has','been','was','were','are','not',
  'but','all','any','can','had','her','his','its','our','out','their','there','they','what','when',
  'which','who','will','would','you','your','about','after','again','also','been','before','being',
  'because','over','same','some','such','than','then','them','these','those','very','still','since',
  'week','day','days','please','sir','madam','kindly','request','issue','problem','complaint',
])

/** Words that carry meaning, deduplicated. Numbers are dropped: dates and room numbers
 *  make unrelated grievances look similar. */
export function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  )
}

/** Jaccard: shared terms over total distinct terms. Symmetric, bounded, and it does not
 *  reward one long grievance for containing a short one. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared += 1
  const union = a.size + b.size - shared
  return union === 0 ? 0 : shared / union
}

/**
 * Single-link clustering over the similarity graph.
 *
 * Single-link chains, which is usually a weakness and is right here: five complaints
 * about "mess food" and five about "mess timings" that share "mess" *should* surface as
 * one thing for a human to look at. The officer splits them if they disagree, and the
 * cohesion score tells them how confident to be.
 */
export function clusterGrievances(items: ClusterInput[]): Cluster[] {
  const docs = items.map((item) => ({ item, t: terms(`${item.subject} ${item.body}`) }))

  const parent = docs.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const pairScores = new Map<string, number>()
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const s = similarity(docs[i]!.t, docs[j]!.t)
      if (s >= SIMILARITY_FLOOR) {
        union(i, j)
        pairScores.set(`${i}:${j}`, s)
      }
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < docs.length; i++) {
    const root = find(i)
    const list = groups.get(root) ?? []
    list.push(i)
    groups.set(root, list)
  }

  const clusters: Cluster[] = []
  for (const members of groups.values()) {
    if (members.length < MIN_CLUSTER_SIZE) continue

    let total = 0
    let pairs = 0
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        total += similarity(docs[members[a]!]!.t, docs[members[b]!]!.t)
        pairs += 1
      }
    }

    // Terms present in most of the group, which is what an officer needs to see to judge
    // whether the grouping is real.
    const counts = new Map<string, number>()
    for (const m of members) {
      for (const t of docs[m]!.t) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    const shared = [...counts.entries()]
      .filter(([, n]) => n >= Math.ceil(members.length * 0.6))
      .sort((x, y) => y[1] - x[1])
      .slice(0, 6)
      .map(([t]) => t)

    const sorted = members
      .map((m) => docs[m]!.item)
      .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())

    // Only call it a category cluster when the members agree; a mixed group is a signal
    // about the taxonomy, not about the category.
    const categoryIds = new Set(sorted.map((s) => s.categoryId))

    clusters.push({
      members: sorted.map((s) => s.id),
      terms: shared,
      cohesion: pairs === 0 ? 0 : total / pairs,
      categoryId: categoryIds.size === 1 ? (sorted[0]!.categoryId ?? null) : null,
    })
  }

  // Biggest first: a systemic problem affecting twenty students outranks one affecting
  // three, whatever their cohesion scores.
  return clusters.sort((a, b) => b.members.length - a.members.length || b.cohesion - a.cohesion)
}

/** Possible duplicates of one grievance, for the filing form and the case view. */
export function findRelated(
  target: Pick<ClusterInput, 'subject' | 'body'>,
  candidates: ClusterInput[],
  limit = 5,
): Array<{ id: string; score: number }> {
  const t = terms(`${target.subject} ${target.body}`)
  return candidates
    .map((c) => ({ id: c.id, score: similarity(t, terms(`${c.subject} ${c.body}`)) }))
    .filter((r) => r.score >= SIMILARITY_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export type ClusterableGrievance = Pick<
  Grievance,
  'id' | 'subject' | 'body' | 'categoryId' | 'createdAt'
>
