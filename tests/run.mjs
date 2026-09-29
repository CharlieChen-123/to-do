/**
 * 纯逻辑回归测试跑批器
 * ============================================================
 * 这些测试存在的意义：标签合并 / 「今天」计数这类逻辑全在纯函数里，
 * 光靠 tsc 和肉眼看代码抓不到错。第一次写出来就抓到了一个真 bug ——
 * 删掉内置标签「其它」时，兜底标签会整个消失（分类失败的内容就指向了
 * 一个不存在的标签）。改完这行以后再加功能，跑一下就有底。
 *
 * 跑法（在 jot/ 目录下）：
 *     node tests/run.mjs
 *
 * 实现：用项目自带的 esbuild 把每个 .test.ts 单独 bundle 成 node 可执行的
 * ESM，其中 dexie 被替换成 tests/dexie-stub.mjs（不碰 indexedDB）。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const tests = [
  'tags.test.ts',
  'todayCount.test.ts',
  'meta.test.ts',
  'trash.test.ts',
  'color.test.ts',
  'englishInput.test.ts',
]

const out = mkdtempSync(join(root, '.test-out-'))
let failed = 0

for (const t of tests) {
  console.log(`\n=== ${t} ===`)
  const bundle = join(out, `${t}.mjs`)
  try {
    await build({
      absWorkingDir: root,
      entryPoints: [`tests/${t}`],
      bundle: true,
      platform: 'node',
      format: 'esm',
      alias: { dexie: './tests/dexie-stub.mjs' },
      external: ['react', 'react-dom'],
      outfile: bundle,
      logLevel: 'warning',
    })
    execFileSync(process.execPath, [bundle], { stdio: 'inherit' })
  } catch (err) {
    failed++
    console.error(`  ↑ 失败：${err instanceof Error ? err.message : String(err)}`)
  }
}

rmSync(out, { recursive: true, force: true })

console.log(
  failed === 0
    ? `\n全部通过（${tests.length} 个用例文件）`
    : `\n有 ${failed} 个用例文件失败`,
)
if (failed) process.exit(1)
