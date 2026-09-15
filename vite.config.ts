import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves a project site under "<user>.github.io/<repo>/",
// so the built assets need to know about this subpath.
export default defineConfig({
  base: '/x86sim/',
  plugins: [react()],
})
