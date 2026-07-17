import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Use the test-specific tsconfig so vitest's own type-checking picks up
    // vitest/globals types. This is what prevents TS2493 on mock.calls access.
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
})
