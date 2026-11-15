import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js','tests/business/**/*.test.js','fixtures/consumer/tests/*.test.js'],
    exclude: ['**/node_modules/**','**/tests/unit/mirror/**','**/tests/interaction/mirror/**'],
    testTimeout: 20000
  }
});
