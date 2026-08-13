/**
 * Groups the institution's flat category list into parent/child for the filing form's
 * <select>. Only leaves are selectable — a category with children is a grouping label,
 * not something a grievance actually belongs to (mirrors scripts/seed.ts's taxonomy,
 * where every real grievance category sits at the leaf).
 *
 * ponytail: an active child whose parent has been deactivated has nowhere to render
 * (its parent is filtered out of `categories` before this runs) and silently drops.
 * Institutions manage their own taxonomy through the officer console, which is expected
 * to stop that state existing rather than this form working around it.
 */
import type { Category } from '@/db/schema'

export interface CategoryTreeNode {
  id: string
  name: string
  children: Array<{ id: string; name: string }>
}

export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const byParent = new Map<string | null, Category[]>()
  for (const c of categories) {
    const list = byParent.get(c.parentId)
    if (list) list.push(c)
    else byParent.set(c.parentId, [c])
  }

  const topLevel = byParent.get(null) ?? []
  return topLevel.map((parent) => ({
    id: parent.id,
    name: parent.name,
    children: (byParent.get(parent.id) ?? []).map((c) => ({ id: c.id, name: c.name })),
  }))
}
