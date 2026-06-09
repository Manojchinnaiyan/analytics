import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  minify: true,
  // Bundle rrweb IN (first-party) instead of leaving it as an external import,
  // so the vendored SDK is fully self-contained — no third-party CDN, served
  // from the customer's own (Cloudflare-fronted) domain.
  noExternal: ['rrweb'],
})
