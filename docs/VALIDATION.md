# Validation notes

## Historical prototype record — 2026-09-22

The original local prototype's verification document records a passing build,
14 Chromium browser scenarios, zero primary-workflow console/page errors, and
a checked 3840 × 2160 PNG export. This is a historical record, not a new run.
The original screenshots and internal notes are not part of this source release.

## Public-source preparation — 2026-10-21

The public copy excludes internal operational/reference files and generated
outputs. The test launcher uses portable Playwright defaults, with CHROME_PATH
available as an explicit override. Runtime functionality is otherwise preserved;
the inspiration text no longer refers to private saved bookmark material.

### Checks actually run for this release

- `npm run build`: PASS (TypeScript and Vite production build).
- `CHROME_PATH=<installed Chrome executable> npm test`: PASS, all 14 scenarios.
- Browser report: zero primary-workflow console/runtime errors.
- 4K download: PNG header verified as 3840 × 2160; canvas size restored.
- Mobile portrait/landscape: Chromium viewport emulation passed.
- Reduced motion and WebGL failure/retry states: passed.
- `npm ls --depth=0`: all five direct dependencies match the pinned versions.
- Three.js full license notice: confirmed copied unchanged into `dist/`.

Environment: macOS, Node.js 26.6.0, Vite 7.1.7, installed Google Chrome via
a fresh temporary Playwright profile (no existing user profile or login data).
Dependencies were copied from the original installed tree; a fresh `npm ci`
was not exercised. The initial sandbox blocked listening and browser startup;
the approved local test runs completed with execution permissions.

The build emitted a large-chunk advisory: JavaScript about 585 kB minified /
151 kB gzip. This is an advisory, not a failed build.

Release text was scanned for common credential/private-key/token formats,
email addresses and personal absolute home-directory paths; no matches were found in the
selected public files. This limited automated scan is not a guarantee that
all possible confidential information has been detected.

Generated test images and machine reports are retained locally outside the
public upload set. Original selected project files were hash-checked unchanged.
No historical commits or internal reference materials are included.

## Limits

Mobile tests use Chromium viewport emulation, not a physical phone GPU.
Safari and physical iPhone/Android devices remain unverified. WebGL rendering
and audio behavior can vary across devices. No external-user performance or
adoption claims are made.
