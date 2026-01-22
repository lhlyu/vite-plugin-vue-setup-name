import plugin from './src/index'

async function test() {
    const instance = plugin({ strategy: 'file' })
    if (typeof instance.transform !== 'function') return

    const code = `<script setup name="MyComponent">
</script>`
    const id = 'test.vue'

    // @ts-ignore
    const result = await (instance.transform as any)(code, id)
    console.log('Result for name="MyComponent":')
    console.log(result?.code)

    const code2 = `<script setup>
</script>`
    // @ts-ignore
    const result2 = await (instance.transform as any)(code2, id)
    console.log('Result for strategy="file":')
    console.log(result2?.code)

    const code3 = `<script setup lang="ts">
</script>`
    // @ts-ignore
    const result3 = await (instance.transform as any)(code3, id)
    console.log('Result for lang="ts" and strategy="file":')
    console.log(result3?.code)

    const code4 = `<script setup>
defineOptions({
  name: 'DefinedName'
})
</script>`
    // @ts-ignore
    const result4 = await (instance.transform as any)(code4, id)
    console.log('Result for defineOptions:')
    console.log(result4?.code)
}

test()
