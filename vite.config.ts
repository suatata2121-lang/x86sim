import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from the custom domain simx86.com (see public/CNAME), i.e. from the root,
// so the built assets use absolute paths from "/".
export default defineConfig({
  base: '/',
  plugins: [react()],
})
