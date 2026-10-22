# NOCTURNE · 밤을, 연출하다

An interactive moonlit lake built with Three.js and Web Audio. Touch the water
to create ripples and gather fireflies, direct the light and camera, and save
a 3840 × 2160 PNG of the scene. The interface is in Korean.

This is an initial public source release of a previously local prototype.
No external adoption, maintenance history or physical mobile validation is
claimed. Maintained here under the `minji-pm` account.

## Run locally

Use Node.js 22.12+ (or Node.js 24) and npm:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5198. After dependency installation the scene needs no
external API, downloaded media, account or credentials.

```sh
npm run build
npm run preview
```

The production output is in `dist/`. Serve it with a static HTTP server.
Preserve `THIRD_PARTY_NOTICES.txt` when distributing the built app. Public
hosting and a hosted demo are not part of this initial source release.

## Controls

- Click, drag or touch the water: create ripples and gather fireflies.
- **소리 켜기**: enable generated ambient sound; audio starts muted.
- **달빛의 숲 / 푸른 새벽 / 붉은 달**: switch the scene palette.
- **연출**: adjust fog, wind, fireflies, moonlight and camera.
- **Space**: pause/play; controls retain their own keyboard behavior.
- **H**: hide/show tools. The NOCTURNE button also restores the interface.
- **Esc**: close a panel or leave immersive mode.
- **Enter**, with the canvas focused: call light to the water.
- **4K 장면 저장**: save the current scene as a 3840 × 2160 PNG without the UI.

Settings are stored locally in the browser. Sound requires an explicit gesture.
The app does not request camera access or send scene settings to a server.
Reduced-motion preferences start the scene paused.

## Browser tests

Install the Playwright Chromium browser once, then run against a local server:

```sh
npx playwright install chromium
npm run dev
# In another terminal:
npm test
```

`CHROME_PATH` optionally selects an installed Chromium/Chrome executable;
`TEST_URL` optionally changes the server URL. Tests generate screenshots,
a 4K image and a JSON report under ignored `artifacts/`. Do not commit these
outputs. See [validation notes](docs/VALIDATION.md) for the distinction between
historical prototype records and checks performed for this release.

## Source map

- `src/world.ts`: procedural 3D scene, water, camera and image export.
- `src/audio.ts`: generated ambience and touch tones.
- `src/main.ts`, `src/style.css`: interface and keyboard interactions.
- `src/settings.ts`: scene settings and normalization.
- `tests/browser.mjs`: browser workflow regression checks.

## Contributing and license

Report reproducible problems through GitHub Issues with browser/version,
steps, expected behavior and actual behavior. Do not include credentials,
personal data or private screenshots. Small, focused pull requests are welcome.

Project code is [MIT licensed](LICENSE). Dependencies retain their own licenses;
see [third-party acknowledgments](THIRD_PARTY.md). The public release excludes
internal notes, `.od-skills`, generated media, installed dependencies and local
build/test artifacts.
