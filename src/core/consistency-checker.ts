/**
 * 跨章节一致性检查 — 本地纯逻辑，不调用模型。
 * 检测已提交章节间的潜在矛盾和异常。
 */

import type { ProjectSnapshot } from './domain'
import { ChapterState } from './domain'

export type Severity = 'warning' | 'error'

export interface ConsistencyIssue {
  severity: Severity
  code: string
  message: string
  chapter?: number
}

export interface ConsistencyReport {
  projectId: string
  issues: ConsistencyIssue[]
  checkedChapters: number
  passed: boolean
}

export function checkConsistency(snapshot: ProjectSnapshot): ConsistencyReport {
  const issues: ConsistencyIssue[] = []
  const chapters = snapshot.chapters.slice().sort((a, b) => a.number - b.number)
  const committed = chapters.filter(c => c.state === ChapterState.COMMITTED)
  const checkedChapters = committed.length

  if (checkedChapters === 0) {
    return { projectId: snapshot.project.id, issues, checkedChapters: 0, passed: true }
  }

  // 1. 章节编号连续性
  const numbers = committed.map(c => c.number)
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] !== numbers[i - 1] + 1) {
      issues.push({
        severity: 'error',
        code: 'CHAPTER_GAP',
        message: `已完成章节不连续：第 ${numbers[i - 1]} 章之后直接跳到第 ${numbers[i]} 章，中间缺第 ${numbers[i - 1] + 1} 章。`,
        chapter: numbers[i],
      })
    }
  }

  // 2. storyState 与实际章节一致性
  const expectedNext = (committed[committed.length - 1]?.number ?? 0) + 1
  if (snapshot.storyState.nextChapter !== expectedNext) {
    issues.push({
      severity: 'warning',
      code: 'NEXT_CHAPTER_MISMATCH',
      message: `故事状态记录下一章为第 ${snapshot.storyState.nextChapter} 章，但已完成章节暗示下一章应为第 ${expectedNext} 章。`,
    })
  }

  const actualCommitted = new Set(committed.map(c => c.number))
  const stateCommitted = new Set(snapshot.storyState.committedChapters)
  if (actualCommitted.size !== stateCommitted.size || [...actualCommitted].some(n => !stateCommitted.has(n))) {
    issues.push({
      severity: 'warning',
      code: 'COMMITTED_LIST_MISMATCH',
      message: `故事状态记录的已完成章节列表与实际已提交章节不一致。`,
    })
  }

  // 3. 每个已完成章节是否有摘要
  for (const ch of committed) {
    if (!ch.summary || ch.summary.trim().length < 10) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_SUMMARY',
        message: `第 ${ch.number} 章缺少结算摘要，可能影响后续连续性上下文。`,
        chapter: ch.number,
      })
    }
  }

  // 4. 正文字数异常
  for (const ch of committed) {
    const charCount = ch.prose.length
    if (charCount < 500) {
      issues.push({
        severity: 'warning',
        code: 'SHORT_CHAPTER',
        message: `第 ${ch.number} 章正文仅 ${charCount} 字，明显偏短，可能为不完整生成。`,
        chapter: ch.number,
      })
    }
  }

  // 5. eventKey 重复检测
  const eventKeyCounts = new Map<string, number[]>()
  for (const ch of committed) {
    // eventKey 存储在 storyState.recentEventKeys，但无法直接关联到章节
    // 通过 summary 间接检查：如果两章 summary 高度相似，可能有重复
  }

  // 6. 章节标题重复
  const titleCounts = new Map<string, number>()
  for (const ch of chapters) {
    titleCounts.set(ch.title, (titleCounts.get(ch.title) ?? 0) + 1)
  }
  for (const [title, count] of titleCounts) {
    if (count > 1 && title.trim()) {
      issues.push({
        severity: 'warning',
        code: 'DUPLICATE_TITLE',
        message: `章节标题「${title}」出现了 ${count} 次。`,
      })
    }
  }

  // 7. 阻塞状态检测：中间章节未提交但后续章节已提交
  const nonCommitted = chapters.filter(c => c.state !== ChapterState.COMMITTED && c.state !== ChapterState.PLANNED)
  for (const ch of nonCommitted) {
    const hasLaterCommitted = committed.some(c => c.number > ch.number)
    if (hasLaterCommitted) {
      const stateLabel = ch.state === ChapterState.PAUSED ? '已暂停' : ch.state === ChapterState.READABLE_DRAFT ? '可读草稿' : '待检查'
      issues.push({
        severity: 'error',
        code: 'BLOCKING_DRAFT',
        message: `第 ${ch.number} 章处于「${stateLabel}」状态，但第 ${ch.number + 1} 章或更后的章节已完成提交。这可能导致连续性断裂。`,
        chapter: ch.number,
      })
    }
  }

  // 8. recentEventKeys 去重检查
  const recentKeys = snapshot.storyState.recentEventKeys
  const uniqueKeys = new Set(recentKeys)
  if (uniqueKeys.size !== recentKeys.length) {
    issues.push({
      severity: 'warning',
      code: 'DUPLICATE_EVENT_KEYS',
      message: `故事状态中记录的 recentEventKeys 存在重复项（${recentKeys.length} 项中仅有 ${uniqueKeys.size} 项唯一）。`,
    })
  }

  return {
    projectId: snapshot.project.id,
    issues,
    checkedChapters,
    passed: issues.filter(i => i.severity === 'error').length === 0,
  }
}
