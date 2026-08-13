import { describe, expect, it } from 'vitest'
import type { Category } from '@/db/schema'
import { buildCategoryTree } from './category-tree'

function mk(overrides: Partial<Category> & Pick<Category, 'id' | 'name'>): Category {
  return {
    institutionId: 'inst-1',
    parentId: null,
    description: null,
    slaResolutionDays: null,
    isSensitive: false,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  }
}

describe('buildCategoryTree', () => {
  it('groups children under their parent and leaves top-level leaves alone', () => {
    const hostel = mk({ id: 'hostel', name: 'Hostel & Mess' })
    const mess = mk({ id: 'mess', name: 'Mess Food Quality', parentId: 'hostel' })
    const room = mk({ id: 'room', name: 'Room Allotment', parentId: 'hostel' })
    const fees = mk({ id: 'fees', name: 'Fees & Scholarship' })

    const tree = buildCategoryTree([hostel, mess, room, fees])

    expect(tree).toEqual([
      { id: 'hostel', name: 'Hostel & Mess', children: [{ id: 'mess', name: 'Mess Food Quality' }, { id: 'room', name: 'Room Allotment' }] },
      { id: 'fees', name: 'Fees & Scholarship', children: [] },
    ])
  })

  it('returns an empty tree for an empty category list', () => {
    expect(buildCategoryTree([])).toEqual([])
  })

  it('drops a child whose parent was filtered out (e.g. a deactivated parent)', () => {
    const orphan = mk({ id: 'orphan', name: 'Orphaned leaf', parentId: 'missing-parent' })
    expect(buildCategoryTree([orphan])).toEqual([])
  })
})
