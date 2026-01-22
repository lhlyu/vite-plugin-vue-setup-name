# vite-plugin-vue-setup-name

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
    // 是否启用, 默认true
    enable?: boolean
    // Only files in the specified directory will take effect.
    // If not specified, all files will take effect
    // 指定目录下的文件才会生效，如果不指定，则全部生效
    dirs?: string[]
    // This parameter only takes effect when there is no attribute name.
    // You can select a policy to generate the name according to the directory name or file name
    // 当setup没有属性name时才会生效，
    // 可以选择根据目录名生成名字或则根据文件名生成名字
    strategy?: 'dir' | 'file'
}
```
