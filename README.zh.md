# vite-plugin-vue-setup-name

[English](./README.md) | [简体中文](./README.zh.md)

[![npm](https://img.shields.io/npm/v/vite-plugin-vue-setup-name)](https://www.npmjs.com/package/vite-plugin-vue-setup-name)
![Last Commit](https://img.shields.io/github/last-commit/lhlyu/vite-plugin-vue-setup-name)

为使用 `<script setup>` 的 Vue 单文件组件补充组件 `name`。

## 特性

- 支持 `<script setup name="MyComponent">`
- 未提供 `name` 时，可按文件路径策略自动生成组件名
- 会尊重已有组件名声明，不覆盖 `defineOptions({ name })` 或普通 `export default { name }`
- 基于 Vite 项目的 `root` 工作，适用于 monorepo 和自定义根目录场景
- 当普通 `<script>` 的默认导出可静态分析时，也可以直接注入 `name`

## 兼容性

- Vite: `^7.0.0 || ^8.0.0`
- Vue SFC 编译器: `@vue/compiler-sfc ^3.5`

## 安装

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

## 快速开始

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

## 工作方式

只有当 SFC 本身还没有声明组件名时，插件才会补充 `name`。

检查顺序如下：

1. 组件内部是否已经显式声明了组件名
2. `<script setup name="...">`
3. `strategy` 生成的回退名称

如果第 1 步命中，插件不会修改源码。

当前识别的已有组件名声明包括：

- `defineOptions({ name: 'MyComponent' })`
- `export default { name: 'MyComponent' }`
- `export default defineComponent({ name: 'MyComponent' })`

## 配置项

```ts
export interface ExtendOptions {
    enable?: boolean
    dirs?: string[]
    strategy?: 'file' | 'dir' | 'path'
    debug?: boolean
}
```

| 配置项     | 类型                        | 默认值      | 说明                                                |
| ---------- | --------------------------- | ----------- | --------------------------------------------------- |
| `enable`   | `boolean`                   | `true`      | 是否启用插件                                        |
| `dirs`     | `string[]`                  | `undefined` | 仅处理这些目录下的文件                              |
| `strategy` | `'file' \| 'dir' \| 'path'` | `'path'`    | 当 `<script setup name>` 未提供时使用的回退命名策略 |
| `debug`    | `boolean`                   | `false`     | 在转换时输出文件到组件名的映射日志                  |

## 策略示例

假设 Vite `root = /project`：

| 文件                                       | `strategy: 'file'` | `strategy: 'dir'` | `strategy: 'path'`    |
| ------------------------------------------ | ------------------ | ----------------- | --------------------- |
| `/project/src/components/foo-bar.vue`      | `foo-bar`          | `components`      | `SrcComponentsFooBar` |
| `/project/src/pages/admin/users/index.vue` | `index`            | `users`           | `SrcPagesAdminUsers`  |
| `/project/src/pages/[id].vue`              | `[id]`             | `pages`           | `SrcPagesId`          |

`dirs` 的解析基于 Vite 项目根目录，而不是 `process.cwd()`。

## 已有 `<script>` 的支持情况

当一个文件同时包含 `<script>` 和 `<script setup>` 时，只要普通 `<script>` 的默认导出属于以下形式之一，插件仍然可以注入 `name`：

- `export default { ... }`
- `export default defineComponent({ ... })`

示例：

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

它会被转换成包含以下内容的普通 `<script>`：

```ts
export default {
    name: 'UserCard',
    inheritAttrs: false,
}
```

## 调试输出

```ts
vueSetupName({
    debug: true,
})
```

示例日志：

```txt
[vite:vue-setup-name] src/components/HelloCard.vue -> HelloCard
```

## 说明

- 插件只处理 `.vue` 文件。
- 如果普通 `<script>` 使用了动态或不受支持的默认导出形态，插件会跳过，而不是进行不安全改写。
- 注入前会对组件名做清洗，避免生成非法输出。
- 如果你已经使用 Vue 官方的 `defineOptions({ name })`，插件不会覆盖它。

## 为什么需要这个插件

Vue 已经支持 `defineOptions({ name })`，但有些团队更喜欢更轻量的写法，例如：

```vue
<script setup name="HelloCard"></script>
```

这个插件保留了这种工作流，同时在没有显式 `name` 时也提供安全的回退命名策略。
