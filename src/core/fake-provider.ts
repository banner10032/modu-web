/**
 * 测试用 Fake Provider — 从 Kotlin S0FakeProvider.kt 翻译。
 */

import type { ChapterTask, Settlement, TextGenerationProvider } from './domain'
import type { ProviderSummary } from './provider-contract'
import type { ConnectionTestResult, CancelResult } from './provider-contract'

export class FakeProvider implements TextGenerationProvider {
  proseCalls = 0
  settlementCalls = 0

  async streamProse(task: ChapterTask, onChunk: (chunk: string) => void): Promise<string> {
    this.proseCalls += 1
    const text = `雨停在旧车站的檐角。${task.goal} 林岑把写着回卷印记的纸页收进书里，决定先去灯下确认它的来处。`
    for (let i = 0; i < text.length; i += 12) {
      onChunk(text.slice(i, i + 12))
    }
    return text
  }

  async completeSettlement(task: ChapterTask, prose: string): Promise<Settlement> {
    this.settlementCalls += 1
    if (!prose.trim()) throw new Error('PROSE_EMPTY')
    return {
      taskId: task.taskId,
      chapter: task.chapter,
      baseRevision: task.baseRevision,
      summary: '林岑在旧车站确认回卷印记的来处，带着新的线索离开。',
      eventKey: `chapter_${task.chapter}_station_clue`,
      eventDescription: '获得旧车站线索：回卷印记与灯下档案有关。',
      events: [],
    }
  }

  connectionSummary(): ProviderSummary | null { return null }
  connectionProfiles(): ProviderSummary[] { return [] }
  selectConnectionProfile(): { ok: false; error: string } { return { ok: false, error: 'UNSUPPORTED' } }
  deleteConnectionProfile(): { ok: false; error: string } { return { ok: false, error: 'UNSUPPORTED' } }
  async testAndSaveConnection(): Promise<ConnectionTestResult> {
    return { type: 'Failed', failure: { code: 'CFG_INVALID_ENDPOINT' as any, safeMessage: 'unsupported', userAction: 'none', retryable: false } }
  }
  cancel(): CancelResult { return 'NOT_ACTIVE' as CancelResult }
}
