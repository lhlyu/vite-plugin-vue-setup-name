import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    cjsDefault: true,
    clean: true,
    target: 'es2020',
})
