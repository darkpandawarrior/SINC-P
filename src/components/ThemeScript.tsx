/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders in the OS theme and then snaps to the stored one a tick
 * later, which is the flash every dark-mode implementation has to solve exactly once.
 * It has to be inline and synchronous, so it cannot be a normal component effect.
 *
 * `next.config.ts` allows 'unsafe-inline' for scripts today, so this passes CSP. If that
 * is ever tightened to nonces, this tag needs the nonce and will otherwise silently stop
 * running, and the only symptom will be the flash coming back.
 */
export function ThemeScript() {
  const js = `try{var t=localStorage.getItem('sincp-theme');if(t){document.documentElement.dataset.theme=t}}catch(e){}`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
