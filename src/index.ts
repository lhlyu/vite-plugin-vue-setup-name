import type { Plugin } from 'vite'
import { parse, compileScript } from '@vue/compiler-sfc'
import MagicString from 'magic-string'
import path from 'path'

const scriptTemplate = (name: string | true, lang: string | true): string => {
    return `<script ${lang ? `lang="${lang}"` : ''}>
import { defineComponent } from 'vue'
export default defineComponent({
  name: '${name}',
})
</script>\n`
}

const getCode = (code: string, name: string | true, lang: string | true) => {
    let s: MagicString | undefined
    const str = () => s || (s = new MagicString(code))
    if (name) {
        str().appendLeft(0, scriptTemplate(name, lang))
    }
    return {
        map: str().generateMap(),
        code: str().toString()
    }
}

function supportVueSetupName(code: string, id: string, strategy?: string) {
    const { descriptor } = parse(code, { ignoreEmpty: false })
    if (!descriptor.script && descriptor.scriptSetup) {
        const result = compileScript(descriptor, { id })
        const name = result.attrs.name
        const lang = result.attrs.lang
        if (name) {
            return getCode(code, name, lang)
        }
    }

    if (strategy) {
        switch (strategy) {
            case 'dir':
                return getCode(code, path.basename(path.dirname(id)), 'js')
            case 'file':
                return getCode(code, path.basename(id).replace(path.extname(id), ''), 'js')
        }
    }

    return null
}

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

export default (options: ExtendOptions = {}): Plugin => {
    const { enable = true, dirs, strategy = undefined } = options

    // 将路径转成绝对路径
    const newDirs = dirs?.map(value => {
        return path.resolve(value)
    })

    return {
        name: 'vite:vue-setup-name',
        enforce: 'pre',
        async transform(code, id) {
            if (!/\.vue$/.test(id)) {
                return null
            }

            const ok = newDirs?.some(value => {
                return id.indexOf(value) === 0
            })

            if (ok === false) {
                return null
            }

            if (enable) {
                return supportVueSetupName.call(this, code, id, strategy)
            }
            return null
        }
    }
}
