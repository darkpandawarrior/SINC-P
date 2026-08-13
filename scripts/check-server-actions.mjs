#!/usr/bin/env node
/**
 * Enforce the one rule about `'use server'` files that nothing else catches early.
 *
 * A file with the `'use server'` directive may only export async functions. Export a
 * constant, an object, a class or a plain function from one and the whole module's
 * exports become invalid. The symptom is not what you would expect:
 *
 *   Error: A "use server" file can only export async functions, found object.
 *   Failed to collect page data for /admin/users
 *
 * or, worse, from the importing page's point of view:
 *
 *   Export submitGrievanceAction doesn't exist in target module
 *
 * which points at an export that is right there in the file and perfectly fine.
 *
 * TypeScript cannot see this rule at all. `next dev` only trips it when the page is
 * actually rendered, so it survives typecheck, survives the test suite, and surfaces
 * either in a production build or in front of whoever opened that screen first.
 *
 * This has happened twice in this repository: `MAX_ATTACHMENTS` in the filing actions,
 * and `inviteUserInitialState` in the admin actions. Twice is a pattern, so it gets a
 * check rather than a third fix.
 *
 * Type-only exports are fine: they are erased before the runtime ever sees them.
 *
 *   node scripts/check-server-actions.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/app', 'src/lib']
const problems = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.tsx?$/.test(full)) check(full)
  }
}

function check(file) {
  const src = readFileSync(file, 'utf8')
  // The directive must be the first statement to apply to the module.
  if (!/^\s*(['"])use server\1/m.test(src.split('\n').slice(0, 3).join('\n'))) return

  const lines = src.split('\n')
  lines.forEach((line, i) => {
    const n = i + 1

    // Allowed: async function declarations, and anything type-only.
    if (/^export\s+async\s+function\s/.test(line)) return
    if (/^export\s+(type|interface)\s/.test(line)) return
    if (/^export\s+type\s*\{/.test(line)) return

    // Disallowed: every other runtime export.
    if (/^export\s+(const|let|var|class)\s/.test(line)) {
      problems.push({ file, n, line: line.trim(), why: 'exports a value' })
    } else if (/^export\s+function\s/.test(line)) {
      problems.push({ file, n, line: line.trim(), why: 'exports a non-async function' })
    } else if (/^export\s*\{/.test(line) && !/^export\s*\{\s*type\s/.test(line)) {
      // A re-export block can smuggle a value out. Flag it for a human to look at
      // rather than trying to resolve what the names refer to.
      problems.push({ file, n, line: line.trim(), why: 're-exports (may include values)' })
    } else if (/^export\s+default\s/.test(line)) {
      problems.push({ file, n, line: line.trim(), why: 'default export' })
    }
  })
}

for (const root of ROOTS) {
  try {
    walk(root)
  } catch {
    // A root that does not exist is not an error worth failing a build over.
  }
}

if (problems.length > 0) {
  console.error("'use server' files may only export async functions.\n")
  for (const p of problems) {
    console.error(`  ${p.file}:${p.n}  ${p.why}`)
    console.error(`    ${p.line}`)
  }
  console.error('\nMove the value into its own module and import it from there.')
  console.error('See src/app/(admin)/admin/users/state.ts for the pattern.\n')
  process.exit(1)
}

console.log("'use server' exports ok.")
