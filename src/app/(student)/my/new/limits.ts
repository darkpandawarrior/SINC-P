/**
 * Upload limits, kept out of `actions.ts`.
 *
 * A file marked `'use server'` may only export async functions. A plain
 * `export const` there does not merely get ignored: it invalidates every export in the
 * module, so the page importing it fails with "Export submitGrievanceAction doesn't
 * exist in target module", which points at the wrong thing entirely. TypeScript cannot
 * see this rule, so it only shows up when the page is actually rendered.
 */

// A student attaching evidence to a hostel, mess or exam complaint rarely needs more
// than a couple of photos or a PDF. This caps a bulk-upload mistake, not a real case.
export const MAX_ATTACHMENTS = 3
