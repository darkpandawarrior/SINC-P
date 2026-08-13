import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts'],
    // The e2e suite needs a running app, so it is opt-in via `npm run test:e2e`.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/db/**'],
      reporter: ['text', 'lcov'],
      // A floor, not a target. It exists to catch a PR that adds a module and no test,
      // not to be chased upward for its own sake. Raise it when the real number has been
      // comfortably above for a while.
      thresholds: { lines: 70, functions: 65, branches: 60, statements: 70 },
    },
  },
})
