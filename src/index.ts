import { normalizePath, type Plugin, type ResolvedConfig } from 'vite'
import { babelParse, parse, walk } from '@vue/compiler-sfc'
import MagicString from 'magic-string'
import path from 'path'

const PLUGIN_NAME = 'vite:vue-setup-name'
const VUE_SFC_RE = /\.vue$/

type NameStrategy = 'file' | 'dir' | 'path'
type SFCDescriptor = ReturnType<typeof parse>['descriptor']
type ScriptAst = ReturnType<typeof babelParse>
type BabelParserPlugin = 'typescript' | 'jsx'

// We only read a very small subset of the Babel AST. Keeping the shape local
// avoids pulling in extra AST type dependencies just for a few fields.
// 这里只读取极少量 Babel AST 字段，保持本地最小类型定义即可，避免为少量字段额外引入 AST 类型依赖。
type ObjectExpressionNode = {
    type: 'ObjectExpression'
    properties: Array<{
        type: string
        key?: {
            type: string
            name?: string
            value?: string
        }
        computed?: boolean
    }>
    start?: number | null
}

// Sanitize generated component names into a stable naming convention.
// 对自动生成的组件名做最小清洗，保持稳定的命名格式。
function sanitizeComponentName(name: string): string {
    return name
        .normalize('NFKD')
        .replace(/[^\w-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
}

// Normalize a generated component name. Explicit names are preserved because
// they are safely serialized with JSON.stringify when injected.
// 清洗自动生成的组件名；显式 name 由 JSON.stringify 安全输出，不改写其内容。
function normalizeGeneratedComponentName(name?: string): string | undefined {
    const trimmed = name?.trim()
    if (!trimmed) return undefined

    const safeName = sanitizeComponentName(trimmed)
    return safeName || undefined
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
    const langAttr = lang ? ` lang="${lang}"` : ''

    return (
        `<script${langAttr}>\n` +
        `export default {\n` +
        `  name: ${JSON.stringify(name)},\n` +
        `}\n` +
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

// Inject `name` into an existing normal <script> block while preserving the
// surrounding formatting as much as possible.
// 在已有普通 <script> 中补 name，尽量保留原有缩进和格式。
function injectNameIntoExistingScript(
    code: string,
    scriptContentStart: number,
    scriptContent: string,
    objectExpression: ObjectExpressionNode,
    name: string,
) {
    if (typeof objectExpression.start !== 'number') return null

    const lineStart = scriptContent.lastIndexOf('\n', objectExpression.start) + 1
    const indent =
        scriptContent.slice(lineStart, objectExpression.start).match(/^[ \t]*/)?.[0] ?? ''

    const s = new MagicString(code)
    s.appendLeft(
        scriptContentStart + objectExpression.start + 1,
        `\n${indent}  name: ${JSON.stringify(name)},`,
    )

    return {
        code: s.toString(),
        map: s.generateMap({ hires: 'boundary' }),
    }
}

// Match Babel parser plugins to the SFC script language so AST detection works
// for TS / TSX / JSX without changing runtime behavior.
// 根据 script lang 选择 Babel parser 插件，让 TS / TSX / JSX 都能正确做 AST 检测。
function getBabelParserPlugins(lang?: string): BabelParserPlugin[] {
    const normalizedLang = lang?.toLowerCase()
    const plugins: BabelParserPlugin[] = []

    if (normalizedLang === 'ts' || normalizedLang === 'tsx') {
        plugins.push('typescript')
    }

    if (normalizedLang === 'jsx' || normalizedLang === 'tsx') {
        plugins.push('jsx')
    }

    return plugins
}

// Parsing failures are treated as "analysis unavailable". The plugin should
// rather skip an unsafe rewrite than mutate code it cannot understand.
// 解析失败时按“无法安全分析”处理：宁可跳过，也不要修改无法确认结构的代码。
function parseScriptContent(code: string, lang?: string): ScriptAst | null {
    try {
        return babelParse(code, {
            sourceType: 'module',
            plugins: getBabelParserPlugins(lang),
        })
    } catch {
        return null
    }
}

// Vue / TS wrappers can hide the real expression node. Strip those wrappers so
// later checks can focus on the actual object / call expression.
// Vue / TS 会在表达式外包裹一层类型节点，这里统一剥离，便于后续只关注真实表达式。
function unwrapExpression(node: any): any {
    let current = node

    while (current) {
        switch (current.type) {
            case 'ParenthesizedExpression':
            case 'TSAsExpression':
            case 'TSSatisfiesExpression':
            case 'TSTypeAssertion':
            case 'TSNonNullExpression':
                current = current.expression
                continue
            default:
                return current
        }
    }

    return current
}

function isIdentifier(node: any, name: string): boolean {
    return node?.type === 'Identifier' && node.name === name
}

// Only statically known `name` keys are considered. Literal `['name']` is
// stable, while dynamic keys such as `[key]` are not.
// 只把可静态确定的 name 键视为组件名；`['name']` 有效，`[key]` 不算。
function getPropertyKeyName(property: {
    type: string
    key?: {
        type: string
        name?: string
        value?: string
    }
    computed?: boolean
}): string | undefined {
    if (property.type !== 'ObjectProperty' && property.type !== 'ObjectMethod') {
        return undefined
    }

    if (!property.computed && property.key?.type === 'Identifier') {
        return property.key.name
    }

    if (property.key?.type === 'StringLiteral') {
        return property.key.value
    }

    return undefined
}

function objectHasNameProperty(objectExpression: ObjectExpressionNode): boolean {
    return objectExpression.properties.some((property) => getPropertyKeyName(property) === 'name')
}

// Spreads and non-literal computed keys may introduce or overwrite `name` at
// runtime, so injecting into such objects is not provably safe.
// 展开属性和非字面量计算属性可能在运行时引入或覆盖 name，因此不做冒险注入。
function objectCanSafelyReceiveName(objectExpression: ObjectExpressionNode): boolean {
    return !objectExpression.properties.some(
        (property) =>
            property.type === 'SpreadElement' ||
            (property.computed && property.key?.type !== 'StringLiteral'),
    )
}

// Only rewrite script blocks we can prove are safe:
// - export default { ... }
// - export default defineComponent({ ... })
// Anything more dynamic is skipped to avoid corrupting user code.
// 只处理两种可确认安全的默认导出：
// - export default { ... }
// - export default defineComponent({ ... })
// 其余更动态的写法直接跳过，避免误改源码。
function findComponentOptionsObject(scriptContent: string, lang?: string) {
    const ast = parseScriptContent(scriptContent, lang)
    if (!ast) return null

    for (const statement of ast.program.body) {
        if (statement.type !== 'ExportDefaultDeclaration') continue

        const declaration = unwrapExpression(statement.declaration)

        if (declaration?.type === 'ObjectExpression') {
            return declaration as ObjectExpressionNode
        }

        if (!declaration || declaration.type !== 'CallExpression') return null
        if (!isIdentifier(unwrapExpression(declaration.callee), 'defineComponent')) {
            return null
        }

        const firstArgument = unwrapExpression(declaration.arguments[0])
        if (firstArgument?.type === 'ObjectExpression') {
            return firstArgument as ObjectExpressionNode
        }

        return null
    }

    return null
}

// Use AST detection first so local objects like `{ name: 'x' }` inside
// `<script setup>` do not get mistaken for component options.
// 优先走 AST 检测，避免把 `<script setup>` 里的普通对象 `{ name: 'x' }`
// 误判成组件 name 声明。
function scriptSetupHasDeclaredName(content: string, lang?: string): boolean {
    const ast = parseScriptContent(content, lang)

    if (!ast) {
        return /defineOptions\s*\(\s*{[\s\S]*?\bname\s*:/.test(content)
    }

    let hasName = false

    walk(ast.program, {
        enter(node: any) {
            if (hasName || node.type !== 'CallExpression') return
            if (!isIdentifier(unwrapExpression(node.callee), 'defineOptions')) return

            const firstArgument = unwrapExpression(node.arguments[0])
            if (
                firstArgument?.type === 'ObjectExpression' &&
                objectHasNameProperty(firstArgument)
            ) {
                hasName = true
            }
        },
    })

    return hasName
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
    strategy: NameStrategy,
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
            if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
                return undefined
            }

            const rawSegments = rel
                .replace(/\.vue$/, '')
                .split(/[\\/]/)
                .filter(Boolean)

            if (rawSegments[rawSegments.length - 1]?.toLowerCase() === 'index') {
                rawSegments.pop()
            }

            const segments = rawSegments.map(sanitizeSegment).filter(Boolean)

            if (segments.length === 0) return undefined
            return segments.join('')
        }
    }
}

// Explicit `name=""` on `<script setup>` has higher priority than the fallback
// path strategy so README behavior and implementation stay aligned.
// `<script setup name=\"...\">` 的优先级高于策略生成名，确保实现与 README 保持一致。
function resolveComponentName(
    id: string,
    strategy: NameStrategy,
    root: string,
    explicitName?: string,
): string | undefined {
    const normalizedExplicitName = explicitName?.trim()
    if (normalizedExplicitName) return normalizedExplicitName

    return normalizeGeneratedComponentName(resolveNameByStrategy(id, strategy, root))
}

// A component is considered already named only when the declaration is attached
// to real component options, not anywhere in the file text.
// 只有真正挂在组件 options 上的 name 才算“已声明”，不是文件里任意出现的 `name`。
function hasDeclaredComponentName(descriptor: SFCDescriptor): boolean {
    if (
        descriptor.scriptSetup &&
        scriptSetupHasDeclaredName(
            descriptor.scriptSetup.content,
            typeof descriptor.scriptSetup.lang === 'string'
                ? descriptor.scriptSetup.lang
                : undefined,
        )
    ) {
        return true
    }

    if (!descriptor.script) return false

    const componentOptions = findComponentOptionsObject(
        descriptor.script.content,
        typeof descriptor.script.lang === 'string' ? descriptor.script.lang : undefined,
    )

    return componentOptions ? objectHasNameProperty(componentOptions) : false
}

// Keep debug output readable across platforms by always printing normalized,
// project-relative file paths.
// 调试日志统一输出相对根目录的标准化路径，避免跨平台路径分隔符差异。
function debugLog(debug: boolean, root: string, id: string, message: string) {
    if (!debug) return

    const relativePath = normalizePath(path.relative(root, id))
    console.log(`[${PLUGIN_NAME}] ${relativePath} ${message}`)
}

// Core logic: inject component name for <script setup>
// 核心逻辑：为 <script setup> 自动补充组件 name
function supportVueSetupName(
    code: string,
    id: string,
    strategy: NameStrategy,
    root: string,
    debug: boolean,
) {
    const { descriptor } = parse(code, { filename: id, ignoreEmpty: false })

    if (!descriptor.scriptSetup) return null
    if (hasDeclaredComponentName(descriptor)) return null

    const explicitName =
        typeof descriptor.scriptSetup.attrs.name === 'string'
            ? descriptor.scriptSetup.attrs.name
            : undefined
    const name = resolveComponentName(id, strategy, root, explicitName)
    if (!name) return null

    if (descriptor.script) {
        const componentOptions = findComponentOptionsObject(
            descriptor.script.content,
            typeof descriptor.script.lang === 'string' ? descriptor.script.lang : undefined,
        )

        if (!componentOptions) {
            debugLog(debug, root, id, 'skipped: unsupported default export in <script>')
            return null
        }

        if (!objectCanSafelyReceiveName(componentOptions)) {
            debugLog(debug, root, id, 'skipped: dynamic properties in component options')
            return null
        }

        debugLog(debug, root, id, `-> ${name} (updated existing <script>)`)
        return injectNameIntoExistingScript(
            code,
            descriptor.script.loc.start.offset,
            descriptor.script.content,
            componentOptions,
            name,
        )
    }

    debugLog(debug, root, id, `-> ${name}`)
    return injectScript(
        code,
        name,
        typeof descriptor.scriptSetup.lang === 'string' ? descriptor.scriptSetup.lang : undefined,
    )
}

interface ExtendOptions {
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
    strategy?: NameStrategy
    // Whether to enable debug logs, printing file and component name mapping
    // 是否开启调试日志，打印文件与组件名映射
    debug?: boolean
}

// Vite 插件入口
export default function vueSetupName(options: ExtendOptions = {}): Plugin {
    const { enable = true, dirs, strategy = 'path', debug = false } = options

    let root = process.cwd()
    let absoluteDirs = resolveDirs(dirs, root)

    return {
        name: PLUGIN_NAME,
        enforce: 'pre',

        // Resolve the real Vite root instead of relying on process.cwd().
        // This keeps monorepos and custom-root projects working correctly.
        // 使用 Vite 真正解析后的 root，而不是 process.cwd()，确保 monorepo / 自定义 root 正常工作。
        configResolved(config: ResolvedConfig) {
            root = config.root
            absoluteDirs = resolveDirs(dirs, root)
        },

        // Vite 6.3+ supports hook filters. We still keep the runtime guard in
        // the handler so behavior stays correct if the filter is bypassed.
        // Vite 6.3+ 支持 hook filter；这里仍保留 handler 内的运行时判断，避免过滤器失效时行为异常。
        transform: {
            filter: {
                id: VUE_SFC_RE,
            },
            handler(code, id) {
                const normalizedId = normalizePath(id)

                if (!enable || !VUE_SFC_RE.test(normalizedId)) return null

                if (
                    absoluteDirs?.length &&
                    !absoluteDirs.some(
                        (dir) => normalizedId === dir || normalizedId.startsWith(`${dir}/`),
                    )
                ) {
                    return null
                }

                return supportVueSetupName(code, id, strategy, root, debug)
            },
        },
    }
}

function resolveDirs(dirs: string[] | undefined, root: string): string[] | undefined {
    return dirs?.map((dir) => normalizePath(path.resolve(root, dir)))
}
