import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
export default defineConfig([
 globalIgnores(['.next/**','out/**','coverage/**','playwright-report/**','test-results/**','next-env.d.ts']),
 js.configs.recommended, ...tseslint.configs.recommended,
 { files:['**/*.{js,mjs,ts,tsx}'], languageOptions:{globals:{...globals.browser,...globals.node}} },
 { files:['**/*.{tsx,jsx}'], plugins:{'react-hooks':hooks,'jsx-a11y':a11y}, rules:{...hooks.configs.recommended.rules,...a11y.configs.recommended.rules} },
]);
