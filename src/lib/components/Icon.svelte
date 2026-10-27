<script lang="ts" module>
  // Stroke icons (24×24, Lucide-style) standing in for the SF Symbols used by the macOS app.
  const PATHS = {
    folder: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    eyeOff: 'M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68 M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.39-1.61 M14.12 14.12a3 3 0 1 1-4.24-4.24 M2 2l20 20',
    zoomIn: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M21 21l-4.35-4.35 M11 8v6 M8 11h6',
    zoomOut: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M21 21l-4.35-4.35 M8 11h6',
    fit: 'M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41',
    moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
    system: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M12 2v20 M12 6h4.5 M12 10h7.5 M12 14h7.5 M12 18h4.5',
    share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13',
    stack: 'M12 2 2 7l10 5 10-5-10-5Z M2 17l10 5 10-5 M2 12l10 5 10-5',
    save: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
    reset: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5',
    chevronRight: 'M9 18l6-6-6-6',
    chevronUp: 'M18 15l-6-6-6 6',
    chevronDown: 'M6 9l6 6 6-6',
    sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
    text: 'M4 7V4h16v3 M9 20h6 M12 4v16',
    grid: 'M5 5h.01 M12 5h.01 M19 5h.01 M5 12h.01 M12 12h.01 M19 12h.01 M5 19h.01 M12 19h.01 M19 19h.01',
    glitch: 'M3 3h18v18H3z M3 12h4l2-4 3 8 2-4h7',
    dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M8 8h.01 M16 8h.01 M12 12h.01 M8 16h.01 M16 16h.01',
    copy: 'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2',
    imagePlus: 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7 M16 5h6 M19 2v6 M21 15l-5-5L5 21 M9 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    clipboard: 'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    tv: 'M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M8 22h8 M12 18v4',
    scanlines: 'M3 5h18 M3 9h18 M3 13h18 M3 17h18 M3 21h18',
    link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
    trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    // Glitch subsections
    columns: 'M3 3h18v18H3z M9 3v18 M15 3v18',
    arrows: 'M8 3 4 7l4 4 M4 7h16 M16 21l4-4-4-4 M20 17H4',
    blocks: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
    drop: 'M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0Z M4 14h16',
    dashed: 'M5 3a2 2 0 0 0-2 2 M9 3h1 M14 3h1 M19 3a2 2 0 0 1 2 2 M21 9v1 M21 14v1 M21 19a2 2 0 0 1-2 2 M14 21h1 M9 21h1 M5 21a2 2 0 0 1-2-2 M3 14v1 M3 9v1 M8 8h8v8H8z',
    sort: 'M3 6h18 M7 12h10 M10 18h4',
    bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
    rgb: 'M9 4a5 5 0 1 0 0 10A5 5 0 0 0 9 4Z M15 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z M12 10a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
    chip: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3',
    wave: 'M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0 M2 6h20 M2 18h20',
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>

<style>
  svg {
    flex: none;
    display: block;
  }
</style>
