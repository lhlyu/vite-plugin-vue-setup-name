# vite-plugin-vue-setup-name

[English](./README.md) | [简体中文](./README.zh.md)

[![npm](https://img.shields.io/npm/v/vite-plugin-vue-setup-name)](https://www.npmjs.com/package/vite-plugin-vue-setup-name)
![Last Commit](https://img.shields.io/github/last-commit/lhlyu/vite-plugin-vue-setup-name)

Add component `name` support for Vue SFCs that use `<script setup>`.

## Features

- Supports `<script setup name="MyComponent">`
- Falls back to automatic name generation from file path when `name` is not provided
- Respects existing names declared with `defineOptions({ name })` or normal `export default { name }`
- Works with Vite project `root`, including monorepos and custom-root projects
- Can inject `name` into an existing normal `<script>` when the default export is statically analyzable

## Compatibility

- Vite: `^7.0.0 || ^8.0.0`
- Vue SFC compiler: `@vue/compiler-sfc ^3.5`

## Install

```bash
npm i -D vite-plugin-vue-setup-name
```

```bash
yarn add -D vite-plugin-vue-setup-name
```

```bash
pnpm add -D vite-plugin-vue-setup-name
```

```bash
bun add -D vite-plugin-vue-setup-name
```

## Quick Start

`vite.config.ts`

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueSetupName from 'vite-plugin-vue-setup-name'

export default defineConfig({
    plugins: [
        vue(),
        vueSetupName({
            dirs: ['./src/components'],
        }),
    ],
})
```

`HelloCard.vue`

```vue
<template>
    <div>hello</div>
</template>

<script setup lang="ts" name="HelloCard">
const count = 1
</script>
```

## How It Works

The plugin only adds a component name when the SFC does not already declare one.

It checks in this order:

1. Existing component name declared in the SFC
2. `<script setup name="...">`
3. Generated name from `strategy`

If step 1 matches, the plugin does nothing and keeps the original code unchanged.

Recognized existing name declarations:

- `defineOptions({ name: 'MyComponent' })`
- `export default { name: 'MyComponent' }`
- `export default defineComponent({ name: 'MyComponent' })`

## Options

```ts
export interface ExtendOptions {
    enable?: boolean
    dirs?: string[]
    strategy?: 'file' | 'dir' | 'path'
    debug?: boolean
}
```

| Option     | Type                        | Default     | Description                                                       |
| ---------- | --------------------------- | ----------- | ----------------------------------------------------------------- |
| `enable`   | `boolean`                   | `true`      | Enable or disable the plugin                                      |
| `dirs`     | `string[]`                  | `undefined` | Only run for files inside these directories                       |
| `strategy` | `'file' \| 'dir' \| 'path'` | `'path'`    | Fallback strategy used when `<script setup name>` is not provided |
| `debug`    | `boolean`                   | `false`     | Print file-to-name mapping logs during transform                  |

## Strategy Examples

Assume Vite `root = /project`:

| File                                       | `strategy: 'file'` | `strategy: 'dir'` | `strategy: 'path'`    |
| ------------------------------------------ | ------------------ | ----------------- | --------------------- |
| `/project/src/components/foo-bar.vue`      | `foo-bar`          | `components`      | `SrcComponentsFooBar` |
| `/project/src/pages/admin/users/index.vue` | `index`            | `users`           | `SrcPagesAdminUsers`  |
| `/project/src/pages/[id].vue`              | `[id]`             | `pages`           | `SrcPagesId`          |

`dirs` is resolved from the Vite project root, not `process.cwd()`.

## Existing `<script>` Support

If a file contains both `<script>` and `<script setup>`, the plugin can still inject
`name` into the normal `<script>` when the default export is one of these forms:

- `export default { ... }`
- `export default defineComponent({ ... })`

Example:

```vue
<script lang="ts">
export default {
    inheritAttrs: false,
}
</script>

<script setup lang="ts" name="UserCard">
const ready = true
</script>
```

This will be transformed to a normal `<script>` that includes:

```ts
export default {
    name: 'UserCard',
    inheritAttrs: false,
}
```

## Debug Output

```ts
vueSetupName({
    debug: true,
})
```

Example log:

```txt
[vite:vue-setup-name] src/components/HelloCard.vue -> HelloCard
```

## Notes

- The plugin only processes `.vue` files.
- When a normal `<script>` uses a dynamic or unsupported default export shape, the plugin skips it instead of rewriting unsafely.
- The generated component name is sanitized before injection to avoid invalid output.
- If you already prefer Vue's official `defineOptions({ name })`, this plugin will not override it.

## Why Use This Plugin

Vue already supports `defineOptions({ name })`, but some teams prefer a lighter SFC
attribute style such as:

```vue
<script setup name="HelloCard"></script>
```

This plugin keeps that workflow available while still providing a safe fallback
strategy for components without an explicit `name`.
