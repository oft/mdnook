<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })
const paths: Record<string, string[]> = {
  book: ['M4 4h6a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4z', 'M13 7a3 3 0 0 1 3-3h5v14h-5a3 3 0 0 0-3 3'],
  folder: ['M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'],
  folderOpen: ['M3 10V5h6l2 3h9v3', 'M3 10h19l-3 10H3z'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v5h4', 'M9 12h6M9 16h6'],
  image: ['M3 3h18v18H3z', 'M3 17l6-6 4 4 3-3 5 5', 'M15 7h.01'],
  search: ['M16 16l5 5', 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
  chevron: ['M9 5l7 7-7 7'],
  back: ['M15 5l-7 7 7 7'],
  forward: ['M9 5l7 7-7 7'],
  up: ['M5 12l7-7 7 7', 'M12 5v16'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6 6a8 8 0 0 1 13 2M18 18a8 8 0 0 1-13-2'],
  home: ['M3 11l9-8 9 8', 'M5 10v11h14V10', 'M9 21v-8h6v8'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 16v5h16v-5'],
  list: ['M8 6h13M8 12h13M8 18h13', 'M3 6h.01M3 12h.01M3 18h.01'],
  clock: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 6v6l4 2'],
  close: ['M6 6l12 12M18 6L6 18'],
  alert: ['M12 3L2 21h20z', 'M12 9v5M12 17h.01'],
  check: ['M5 12l4 4 10-10'],
  moon: ['M20 14a9 9 0 0 1-10-10 9 9 0 1 0 10 10'],
  sun: ['M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M19 5l-1 1M6 18l-1 1'],
  panel: ['M3 4h18v16H3z', 'M9 4v16'],
  link: ['M10 14l4-4', 'M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0', 'M16 8l2-2a4 4 0 0 0-6-6l-4 4a4 4 0 0 0 0 6'],
}
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(path, i) in paths[name] ?? paths.file" :key="i" :d="path" />
  </svg>
</template>
