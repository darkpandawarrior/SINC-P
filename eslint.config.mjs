import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// `next lint` was removed in Next.js 16. The old `npm run lint` script still called it, so `next`
// read "lint" as a directory argument and died with "Invalid project directory provided, no such
// directory: <repo>/lint". The CI step was failing on a missing linter rather than on any code —
// and eslint was not installed at all, so nothing had been linting this repo since the upgrade.
//
// eslint-config-next 16 ships flat config natively and is imported directly. Do NOT route it
// through @eslint/eslintrc's FlatCompat: the shareable config is already flat, and wrapping it
// throws "Converting circular structure to JSON" from the legacy validator.
export default [
  {
    // Generated and vendored output. `.next` holds bundled third-party code that would produce
    // thousands of findings belonging to nobody.
    ignores: ["**/node_modules/**", ".next/**", "out/**", "build/**", "coverage/**", "storage/**"],
  },
  ...coreWebVitals,
  ...typescript,
];
