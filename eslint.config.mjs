import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier';

export default defineConfig([{ ignores: ['.npm-cache/**', '.expo/**', 'coverage/**'] }, expoConfig, prettier]);
