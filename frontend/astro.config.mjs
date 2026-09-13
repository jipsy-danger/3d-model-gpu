import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  base: '/3d-model',
  integrations: [react()],
  server: { port: 4321, host: true }
});
