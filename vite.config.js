import { defineConfig } from 'vite';
import { execSync } from 'child_process';

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
    __APP_VERSION__: JSON.stringify('0.6.0'),
    __COMMIT_HASH__: JSON.stringify(gitHash()),
  },
});
