import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

const browserTargets = ['chrome107', 'edge107', 'firefox104', 'safari16', 'ios16']

const vendorChunkGroups = [
  {
    name: 'vendor-react',
    packages: ['react', 'react-dom', 'react-router', 'scheduler'],
  },
  {
    name: 'vendor-three',
    packages: ['three'],
  },
  {
    name: 'vendor-motion',
    packages: ['framer-motion', 'motion-dom', 'motion-utils', 'gsap'],
  },
]

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: './',
  // Source-location attributes are useful to local design tooling, but they
  // expose workspace paths and add bytes when shipped in production.
  plugins: [command === 'serve' && inspectAttr(), react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  optimizeDeps: {
    // Keep Vite focused on the active app. Otherwise it also scans the
    // preserved dist_backup/index.html snapshot during dependency discovery.
    entries: ['index.html'],
  },
  build: {
    target: browserTargets,
    manifest: true,
    // The level catalog compresses unusually well; gzip-aware budgets are enforced
    // by scripts/validate-build.mjs instead of Rollup's raw-byte-only warning.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')

          for (const group of vendorChunkGroups) {
            if (group.packages.some((packageName) =>
              normalizedId.includes(`/node_modules/${packageName}/`),
            )) {
              return group.name
            }
          }

          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
