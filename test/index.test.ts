import path from 'node:path'
import type { ResolvedConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import vueSetupName from '../src/index'

const DEFAULT_ROOT = path.join(path.sep, 'virtual', 'workspace', 'app')

async function transformVue(
    code: string,
    id: string,
    options: Parameters<typeof vueSetupName>[0] = {},
    root = DEFAULT_ROOT,
) {
    const plugin = vueSetupName(options)
    plugin.configResolved?.({ root } as ResolvedConfig)

    const transformHook =
        typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
    const result = await transformHook?.call({} as never, code, id)
    if (!result) return null

    return typeof result === 'string' ? result : result.code
}

describe('vite-plugin-vue-setup-name', () => {
    it('prefers the script setup name attribute over the strategy result', async () => {
        const id = path.join(DEFAULT_ROOT, 'src/components/FooCard.vue')
        const code = `
<template><div /></template>
<script setup lang="ts" name="HelloCard">
const count = 1
</script>
`

        const result = await transformVue(code, id, { strategy: 'path' })

        expect(result).toContain('name: "HelloCard"')
        expect(result).not.toContain('SrcComponentsFooCard')
    })

    it('does not treat ordinary object properties as an existing component name', async () => {
        const id = path.join(DEFAULT_ROOT, 'src/components/MyWidget.vue')
        const code = `
<template><div /></template>
<script setup lang="ts">
const meta = { name: 'local-value' }
</script>
`

        const result = await transformVue(code, id, { strategy: 'file' })

        expect(result).toContain('name: "MyWidget"')
    })

    it('uses the resolved Vite root for path strategy output', async () => {
        const id = path.join(DEFAULT_ROOT, 'src/pages/admin/users/index.vue')
        const code = `
<template><div /></template>
<script setup></script>
`

        const result = await transformVue(code, id, { strategy: 'path' })

        expect(result).toContain('name: "SrcPagesAdminUsers"')
    })

    it('uses the resolved Vite root for dirs filtering', async () => {
        const inDirId = path.join(DEFAULT_ROOT, 'src/components/Foo.vue')
        const outDirId = path.join(DEFAULT_ROOT, 'src/pages/Foo.vue')
        const code = `
<template><div /></template>
<script setup></script>
`

        const inDirResult = await transformVue(
            code,
            inDirId,
            { strategy: 'file', dirs: ['./src/components'] },
            DEFAULT_ROOT,
        )
        const outDirResult = await transformVue(
            code,
            outDirId,
            { strategy: 'file', dirs: ['./src/components'] },
            DEFAULT_ROOT,
        )

        expect(inDirResult).toContain('name: "Foo"')
        expect(outDirResult).toBeNull()
    })

    it('injects into an existing normal script default export object', async () => {
        const id = path.join(DEFAULT_ROOT, 'src/components/UserCard.vue')
        const code = `
<script lang="ts">
export default {
  inheritAttrs: false,
}
</script>
<template><div /></template>
<script setup lang="ts">
const ready = true
</script>
`

        const result = await transformVue(code, id, { strategy: 'file' })

        expect(result).toContain('export default {\n  name: "UserCard",\n  inheritAttrs: false,')
        expect(result?.match(/name:/g)).toHaveLength(1)
    })

    it('skips transformation when defineOptions already declares a component name', async () => {
        const id = path.join(DEFAULT_ROOT, 'src/components/HelloCard.vue')
        const code = `
<template><div /></template>
<script setup lang="ts">
defineOptions({
  name: 'ExistingCard',
})
</script>
`

        const result = await transformVue(code, id, { strategy: 'file' })

        expect(result).toBeNull()
    })

    it('skips transformation when a normal script already declares a component name', async () => {
        const id = path.join(DEFAULT_ROOT, 'src/components/HelloCard.vue')
        const code = `
<script>
export default {
  name: 'ExistingCard',
}
</script>
<template><div /></template>
<script setup>
const ready = true
</script>
`

        const result = await transformVue(code, id, { strategy: 'file' })

        expect(result).toBeNull()
    })
})
