# vite-plugin-vue-setup-name

[![npm](https://img.shields.io/npm/v/vite-plugin-vue-setup-name)](https://www.npmjs.com/package/vite-plugin-vue-setup-name)
![Last Commit](https://img.shields.io/github/last-commit/lhlyu/vite-plugin-vue-setup-name)

Make the vue script setup syntax support the name attribute

使`vue setup`语法支持`name`属性

## Install

`npm i -D vite-plugin-vue-setup-name`

`yarn add -D vite-plugin-vue-setup-name`

`pnpm add -D vite-plugin-vue-setup-name`

`bun add -D vite-plugin-vue-setup-name`

## Usage

- vite.config.ts

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import VitePluginVueSetupName from 'vite-plugin-vue-setup-name'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        VitePluginVueSetupName({
            enable: true,
            dirs: ['./src/components'],
        }),
    ],
})
```

- SFC

```vue
<template>
    <div>hello</div>
</template>

<script lang="ts" setup name="hello"></script>
```

## Options

```ts
export interface ExtendOptions {
    // Enable or not, the default is true
    // 是否启用, 默认 true
    enable?: boolean
    // Only files in the specified directory will take effect.
    // If not specified, all files will take effect
    // 指定目录下的文件才会生效，如果不指定，则全部生效
    dirs?: string[]
    // Strategy to generate the name, the default is 'path'
    // 生成组件名的策略，默认 'path'
    // - 'file': Use the filename
    // - 'dir': Use the parent directory name
    // - 'path': Use the relative path from root
    strategy?: 'file' | 'dir' | 'path'
    // Whether to enable debug logs, printing file and component name mapping
    // 是否开启调试日志，打印文件与组件名映射
    debug?: boolean
}
```
