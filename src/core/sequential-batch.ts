/**
 * 顺序批量生成 — 从 Kotlin S3SequentialBatch.kt 翻译。
 * 用户可选 1/2/3 章，系统逐章执行，一次只生成一章。
 */

import type { GenerationResult } from './domain'

export interface SequentialBatchResult {
  requested: number
  completed: number
  terminal: GenerationResult
}

export async function runSequentialBatch(
  requested: number,
  generateChapter: (position: number) => Promise<GenerationResult>,
  afterCommit?: (position: number, result: Extract<GenerationResult, { type: 'Committed' }>) => Promise<void>,
): Promise<SequentialBatchResult> {
  if (requested < 1 || requested > 3) throw new Error('BATCH_SIZE_INVALID')
  let completed = 0
  let terminal: GenerationResult | null = null
  for (let position = 1; position <= requested; position++) {
    const result = await generateChapter(position)
    terminal = result
    if (result.type !== 'Committed') break
    completed += 1
    if (afterCommit) await afterCommit(position, result)
  }
  return { requested, completed, terminal: terminal! }
}
