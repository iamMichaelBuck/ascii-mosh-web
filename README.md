# ASCII Mosh (web)

Browser port of the macOS SwiftUI app in `../osx_app_ascii`. Turns images into ASCII / CP437 art,
retro dithered graphics and datamoshed glitches. Everything runs locally in the browser, and no image leaves the machine.

**Stack:** Vite + Svelte 5 (runes) + TypeScript. All pixel processing runs in a Web Worker on
`OffscreenCanvas`; results come back as transferable `ImageBitmap`s, so the UI never blocks.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (deployable anywhere, relative paths)
npm run check    # svelte-check / TypeScript
```

## Structure

| Swift (macOS)                     | Web                                        |
| --------------------------------- | ------------------------------------------ |
| `Model/EffectSettings.swift`      | `src/lib/model/settings.ts`                |
| `Model/CharacterSets.swift`       | `src/lib/model/charsets.ts`                |
| `Model/Presets.swift`             | `src/lib/model/presets.ts` (localStorage)  |
| `Model/EditorState.swift`         | `src/lib/editor.svelte.ts`                 |
| `Processing/*.swift`              | `src/lib/processing/*.ts` (worker)         |
| `Views/*.swift`                   | `src/lib/components/*.svelte`, `App.svelte`|

The toolbar's style picker switches between three interface styles: **Cyberpunk** (default, green phosphor terminal), **macOS**
(follows light/dark) and **Off-white** (flat warm paper with square corners). Shared tokens live in `src/app.css` (macOS values); the other two
styles override them in `src/skins.css` via `<html data-skin="…">`.

**Presets** can be shared as a link (the settings ride in the URL fragment `#preset=…`, which is never sent to
the server, and only values that differ from the defaults are stored) or exported/imported as `.asciimosh.json`
files, from the Presets menu. Preset files can also be dropped onto the canvas. Everything imported is type-checked
and clamped to the sliders' ranges (`sanitizeSettings` in `src/lib/model/settings.ts`).

Live preview renders a ≤1600 px proxy; Export renders the full-resolution source in a separate
worker. Rapid setting changes are coalesced (one render in flight + one pending), as in the Swift app.

## Shortcuts

| Action | Keys |
| --- | --- |
| Open / Export PNG | ⌘O / ⌘S (Ctrl on Windows/Linux) |
| Paste image | ⌘V (or ⇧⌘V via the clipboard API) |
| Copy ASCII text | ⇧⌘C |
| Save preset | ⌥⌘S |
| Peek at original | hold Space |
| Zoom in / out / fit / 100 % | ⌘= / ⌘− / ⌘0 or F / ⌥⌘0 |
| Toggle Adjust / Glitch / Dither / ASCII | 1 / 2 / 3 / 4 |
| Reseed glitches | R |
| Toggle dark mode | ⇧⌘D |

Canvas: scroll or pinch to zoom around the pointer, drag to pan, double-click to fit.
Sliders: double-click the handle (or press Delete) to reset to the default value.

## Differences from the macOS app

- `⌘1–4` and `⌘R` are reserved by browsers, so the effect toggles are `1–4` and reseed is `R`.
- The glitch RNG is a 32-bit SplitMix variant, so a given seed gives a different (but still stable) pattern than the Swift build.
- Block-element glyphs (░▒▓ etc.) are stretched to fill each ASCII cell, so rows don't show gaps.
- Presets saved in the Mac app (UserDefaults) are not shared with the web app (localStorage).
