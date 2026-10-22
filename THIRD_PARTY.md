# Third-party acknowledgments

## Runtime

NOCTURNE imports Three.js 0.180.0 and its Water, EffectComposer, RenderPass,
UnrealBloomPass, ShaderPass and OutputPass addons from the installed package.
Three.js is MIT licensed, copyright 2010–2025 three.js authors. Its full license
is preserved in `public/THIRD_PARTY_NOTICES.txt`, which Vite also copies into the
production output. Keep this notice when distributing a built app.

Water is used through an import; the upstream Water implementation is not
vendored in this source repository. Its source documentation credits the flat
mirror/water work of Slayvin, Lee Stemkoski and Jonas Wagner (29a.ch):
https://github.com/mrdoob/three.js/blob/r180/examples/jsm/objects/Water.js

## Development tools

The source release does not include node_modules or vendor these tools.
Versions are pinned in package.json and package-lock.json. Their installed
package metadata and license files were reviewed for this release:

| Package | Version | License |
| --- | --- | --- |
| Vite | 7.1.7 | MIT (its package also carries bundled dependency notices) |
| TypeScript | 5.9.3 | Apache-2.0 |
| @playwright/test | 1.55.1 | Apache-2.0 (LICENSE and NOTICE in package) |
| @types/three | 0.180.0 | MIT |

Dependencies retain their own licenses; the project MIT license does not
replace them. Package license files and notices remain available on install.

## Visual inspiration

The original prototype documentation identifies these public interaction
references as inspiration, not included assets or code:

- Moonlit swamp: https://x.com/chetanankola/status/2101595285675970853
- touch:waves: https://x.com/star_tronica/status/2094584296769986730

The prototype also consulted Open Design v0.19.0 web-prototype guidance.
Its `.od-skills` reference files, example/template HTML and internal bookmark
notes are excluded from this release. No upstream reference media is included.
The scene uses procedural geometry/shaders and Web Audio synthesis; the public
asset directory contains only the project favicon and runtime license notice.
