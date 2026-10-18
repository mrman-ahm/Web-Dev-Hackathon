import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
 test: { clearMocks:true, projects:[
  {extends:true,test:{name:'core',environment:'node',include:['tests/contracts/**/*.test.ts','tests/unit/**/*.test.{ts,tsx}'],exclude:['tests/unit/components/**']}},
  {extends:true,test:{name:'components',environment:'jsdom',include:['tests/unit/components/**/*.test.{ts,tsx}'],setupFiles:['./tests/setup.ts']}},
 ]},
});
