/**
 * Shared state shape for the invite form.
 *
 * Lives here rather than in `actions.ts` because a file marked `'use server'` may only
 * export async functions. Exporting a plain object from one does not get ignored: it
 * fails the production build with "A 'use server' file can only export async functions,
 * found object", and the message names the file rather than the export.
 *
 * TypeScript cannot see the rule and `next dev` only trips it when the page is rendered,
 * so `npm run build` and `scripts/check-server-actions.mjs` are what actually catch it.
 */
export interface InviteUserState {
  status: 'idle' | 'error' | 'email-taken' | 'invited'
  message?: string
  invited?: { email: string; fullName: string; temporaryPassword: string }
}

export const inviteUserInitialState: InviteUserState = { status: 'idle' }
