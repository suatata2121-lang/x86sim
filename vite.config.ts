import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages, bir proje sitesini "<user>.github.io/<repo>/" altında yayınlar,
// bu yüzden build edilen varlıkların bu alt yolu bilmesi gerekiyor.
export default defineConfig({
  base: '/x86sim/',
  plugins: [react()],
})
