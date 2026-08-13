import { describe, expect, it } from 'vitest'
import { mapStatus, parseInserts } from './import-legacy'

// Excerpts copied verbatim from the real 2019 SINC-P dump (SINC-P/sqlfile/cms.sql).
// Using the genuine article matters: a parser tested only against tidy synthetic SQL
// falls over on the first phpMyAdmin export.
const REAL_DUMP = `
INSERT INTO \`category\` (\`id\`, \`categoryName\`, \`categoryDescription\`, \`creationDate\`, \`updationDate\`) VALUES
(1, 'E-commerce', 'E-commerce', '2017-03-28 07:10:55', ''),
(2, 'general', 'dsdas', '2017-06-11 10:54:06', '');

INSERT INTO \`subcategory\` (\`id\`, \`categoryid\`, \`subcategory\`, \`creationDate\`, \`updationDate\`) VALUES
(1, 1, 'Online SHopping', '2017-03-28 07:11:07', ''),
(2, 1, 'E-wllaet', '2017-03-28 07:11:20', '');

INSERT INTO \`tblcomplaints\` (\`complaintNumber\`, \`userId\`, \`category\`, \`subcategory\`, \`complaintType\`, \`state\`, \`noc\`, \`complaintDetails\`, \`complaintFile\`, \`regDate\`, \`status\`, \`lastUpdationDate\`) VALUES
(1, 1, 1, 'E-wllaet', 'General Query', 'Punjab', 'test demo', 'test demo test demo', NULL, '2017-03-30 16:52:40', 'closed', '2018-09-05 17:08:27'),
(2, 1, 1, 'Online SHopping', 'General Query', 'Punjab', 'testing', 'sample text for demo', '', '2017-03-30 17:05:56', 'in process', '2017-04-01 17:29:19'),
(3, 1, 1, 'Online SHopping', ' Complaint', 'Punjab', 'ferwekt', 'wetwetwe', '', '2017-03-30 17:07:51', NULL, '2017-05-02 15:57:43');
`

describe('legacy dump parsing', () => {
  it('reads only the requested table', () => {
    const cats = parseInserts(REAL_DUMP, 'category')
    // Must not bleed into `subcategory`, whose name contains "category".
    expect(cats).toHaveLength(2)
    expect(cats[0]![1]).toBe('E-commerce')
  })

  it('does not let subcategory swallow category rows', () => {
    const subs = parseInserts(REAL_DUMP, 'subcategory')
    expect(subs).toHaveLength(2)
    expect(subs.map((r) => r[2])).toEqual(['Online SHopping', 'E-wllaet'])
  })

  it('parses complaint rows including unquoted NULL', () => {
    const rows = parseInserts(REAL_DUMP, 'tblcomplaints')
    expect(rows).toHaveLength(3)
    expect(rows[0]![9]).toBe('2017-03-30 16:52:40')
    expect(rows[0]![8]).toBe('NULL') // complaintFile was unquoted NULL
    expect(rows[2]![10]).toBe('NULL') // status NULL means pending in the old schema
  })

  it('preserves a leading space inside a quoted value', () => {
    // The real data has complaintType = ' Complaint' with a leading space. Trimming
    // inside the quotes would silently alter imported records.
    const rows = parseInserts(REAL_DUMP, 'tblcomplaints')
    expect(rows[2]![4]).toBe(' Complaint')
  })

  it('handles escaped quotes and commas inside strings', () => {
    const sql = `INSERT INTO \`tblcomplaints\` (\`a\`, \`b\`) VALUES
(1, 'the warden\\'s office, room 4'),
(2, 'plain');`
    const rows = parseInserts(sql, 'tblcomplaints')
    expect(rows).toHaveLength(2)
    // A comma inside a quoted string must not split the tuple.
    expect(rows[0]![1]).toBe("the warden's office, room 4")
  })

  it('handles escaped newlines', () => {
    const sql = `INSERT INTO \`x\` (\`a\`) VALUES ('line one\\nline two');`
    expect(parseInserts(sql, 'x')[0]![0]).toBe('line one\nline two')
  })

  it('returns nothing for a table not in the dump', () => {
    expect(parseInserts(REAL_DUMP, 'announcements')).toEqual([])
  })
})

describe('status mapping', () => {
  it('treats the old NULL-means-pending as submitted', () => {
    expect(mapStatus(null)).toBe('submitted')
    expect(mapStatus('')).toBe('submitted')
  })

  it('maps the free-text values the 2019 app actually wrote', () => {
    expect(mapStatus('in process')).toBe('in_progress')
    expect(mapStatus('In Process')).toBe('in_progress')
    expect(mapStatus('closed')).toBe('closed')
  })

  it('files an unrecognised status rather than dropping the row', () => {
    // Losing a grievance during migration is worse than misfiling one.
    expect(mapStatus('something nobody expected')).toBe('submitted')
  })
})
