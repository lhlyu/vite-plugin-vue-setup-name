import type { Plugin } from 'vite'
import { parse } from '@vue/compiler-sfc'
import MagicString from 'magic-string'
import path from 'path'

const PLUGIN_NAME = 'vite:vue-setup-name'

// Normalize path separators to avoid Windows / Unix differences
// 统一路径分隔符，避免 Windows / Unix 不一致问题
function normalizePath(p: string): string {
    return p.replace(/\\/g, '/')
}

// Sanitize component name to avoid generating invalid JS strings
// 对组件名做最小清洗，避免生成非法 JS 字符串
function sanitizeComponentName(name: string): string {
    return name
        .normalize('NFKD')
        .replace(/[^\w-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
}

// Convert string to PascalCase
// 将字符串转换为 PascalCase（仅首字母大写，其余保持原有大小写）
function pascalCase(str: string): string {
    return str
        .split(/[-_/]/)
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')
}

// Create a normal <script> block with component name
// 生成普通 <script> 块，用于补充组件 name
function createScriptBlock(name: string, lang?: string): string {
    const safeName = sanitizeComponentName(name)
    const langAttr = lang ? ` lang="${lang}"` : ''

    return (
        `<script${langAttr}>\n` +
        `import { defineComponent } from 'vue'\n\n` +
        `export default defineComponent({\n` +
        `  name: '${safeName}',\n` +
        `})\n` +
        `</script>\n`
    )
}

// Inject generated <script> code at the specified position
// 在指定位置注入生成的 <script> 代码
function injectScript(code: string, name: string, lang?: string) {
    const s = new MagicString(code)
    s.appendLeft(0, createScriptBlock(name, lang))

    return {
        code: s.toString(),
        map: s.generateMap({ hires: 'boundary' }),
    }
}

// Sanitize a path segment for component name
// 清洗路径段：处理常见路由命名约定
function sanitizeSegment(segment: string): string {
    let name = segment

    // catch-all [...xxx] 或 ...xxx → CatchAll
    if (name.startsWith('[...') || name.startsWith('...')) {
        name = 'CatchAll' + name.replace(/^\[*\.{3}/, '').replace(/]*$/, '')
    }

    // 去掉所有外层方括号 [[id]] → id
    name = name.replace(/^\[+(.*?)]+$/g, '$1')

    // 去掉分组括号 ((auth)) → auth
    while (name.startsWith('(') && name.endsWith(')')) {
        name = name.slice(1, -1)
    }

    // 去掉 @ 前缀
    if (name.startsWith('@')) name = name.slice(1)

    // 非法字符替换 & 合并连字符
    name = name
        .replace(/[^\w-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')

    return pascalCase(name)
}

// Resolve component name based on strategy
// 根据策略生成组件名
function resolveNameByStrategy(
    id: string,
    strategy: 'file' | 'dir' | 'path',
    root: string,
): string | undefined {
    const ext = path.extname(id)
    const base = path.basename(id, ext)

    switch (strategy) {
        case 'file':
            return base
        case 'dir':
            return path.basename(path.dirname(id))
        case 'path': {
            const rel = path.relative(root, id)
            if (rel.startsWith('..') || path.isAbsolute(rel)) return undefined

            const segments = rel
                .replace(/\.vue$/, '')
                .split(/[\\/]/)
                .filter((s) => s && s.toLowerCase() !== 'index')
                .map(sanitizeSegment)

            if (segments.length === 0) return undefined
            return segments.join('')
        }
    }
}

// Check whether the component name has already been declared explicitly
// 判断是否已经显式声明过组件名
function hasComponentName(code: string): boolean {
    return (
        /defineOptions\s*\(\s*{[\s\S]*?\bname\s*:/.test(code) ||
        /defineComponent\s*\(\s*{[\s\S]*?\bname\s*:/.test(code) ||
        /\bname\s*:\s*["'][^"']+["']\s*,?/.test(code)
    )
}

// Core logic: inject component name for <script setup>
// 核心逻辑：为 <script setup> 自动补充组件 name
function supportVueSetupName(
    code: string,
    id: string,
    strategy: 'file' | 'dir' | 'path',
    root: string,
    debug?: boolean,
) {
    const { descriptor } = parse(code, { ignoreEmpty: false })

    if (descriptor.script) return null
    if (!descriptor.scriptSetup) return null
    if (hasComponentName(code)) return null

    const name = resolveNameByStrategy(id, strategy, root)
    if (!name || name.length < 1) return null

    const lang = descriptor.scriptSetup.lang

    if (debug) {
        const rel = path.relative(root, id).replace(/\\/g, '/')
        console.log(`[${PLUGIN_NAME}] ${rel} -> ${sanitizeComponentName(name)}`)
    }

    return injectScript(code, name, lang)
}

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

// Vite 插件入口
export default function vueSetupName(options: ExtendOptions = {}): Plugin {
    const { enable = true, dirs, strategy = 'path', debug = false } = options

    const root = process.cwd()
    const absoluteDirs = dirs?.map((d) => normalizePath(path.resolve(root, d)))

    return {
        name: PLUGIN_NAME,
        enforce: 'pre',
        transform(code, id) {
            if (!enable || !id.endsWith('.vue')) return null

            const normalizedId = normalizePath(id)

            if (
                absoluteDirs?.length &&
                !absoluteDirs.some((dir) => normalizedId.startsWith(dir + '/'))
            ) {
                return null
            }

            return supportVueSetupName(code, normalizedId, strategy, root, debug)
        },
    }
}
