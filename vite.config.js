import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('./package.json');

function gitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  // Relative base so asset paths work on GitHub Pages regardless of repo name.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __COMMIT_HASH__: JSON.stringify(gitHash()),
  },
});
