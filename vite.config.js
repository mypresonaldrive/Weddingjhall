import {defineConfig} from 'vite';
export default defineConfig({
 build:{
  // Stable vendor chunk keeps React cached across app deploys; hashed app
  // chunks get long-term immutable caching from the server.
  rollupOptions:{output:{manualChunks:{'react-vendor':['react','react-dom']}}},
 },
});
