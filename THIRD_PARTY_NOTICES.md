# Third-party license inventory

`LICENSE` covers original Sentriq source and documentation only. Dependencies remain under their own licenses; installers and redistributors must preserve the notice/license files shipped by their package artifacts.

## Local lockfile snapshot

On 2026-10-08, a local scan of the installed pnpm store found 187 distinct package/version manifests and no package whose manifest omitted a `license` field. Declared SPDX/license values grouped as follows: MIT 150, Apache-2.0 13, BSD-3-Clause 6, ISC 10, 0BSD 2, MPL-2.0 4, CC-BY-4.0 1, and `Apache-2.0 AND LGPL-3.0-or-later` 1. The counts sum to 187. This scan checks package metadata only; it does not inspect every copyright notice, generated asset, transitive license text, or final distribution bundle.

Notable packages in the installed tree include:

- `axe-core`, `@axe-core/playwright`, `lightningcss`, and the Windows Lightning CSS binary: declared MPL-2.0.
- `caniuse-lite`: declared CC-BY-4.0.
- `@img/sharp-win32-x64`: declared `Apache-2.0 AND LGPL-3.0-or-later` (platform-specific optional binary in the current Windows install).

Each package's own license/notice file remains authoritative. The repository currently does not produce an automated release SBOM or a complete bundled third-party notice set. Before redistributing a built application or package, regenerate the inventory for the exact target platform and verify the included dependency license texts and attribution obligations. Public npm publishing is not part of this work.
