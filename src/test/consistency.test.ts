import { describe, it, expect } from 'vitest'
import { checkConsistency } from '../core/consistency-checker'
import type { ProjectSnapshot } from '../core/domain'
import { ChapterState, initialStoryState } from '../core/domain'

function makeSnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    project: { id: 'test', title: '测试小说', genre: '玄幻', protagonist: '主角', tone: '热血', premise: '测试', contentScale: 'AN_YONG' as any, plotPace: 'BALANCED' as any, createdAt: Date.now() },
    storyState: { ...initialStoryState(), nextChapter: 3, committedChapters: [1, 2] },
    plan: [],
    chapters: [
      { number: 1, title: '开端', prose: '这是一段足够长的正文内容用于测试一致性检查器，需要超过五百字以确保不触发短章节警告。'.repeat(20), taskId: 't1', state: ChapterState.COMMITTED, summary: '主角踏上旅程，遇到了第一个挑战并成功克服', commitId: 'c1', incompleteReason: null, updatedAt: Date.now() },
      { number: 2, title: '发展', prose: '这是第二章的正文内容，同样足够长以避免触发任何长度相关的警告提示。'.repeat(20), taskId: 't2', state: ChapterState.COMMITTED, summary: '主角进入新世界，结识了同伴', commitId: 'c2', incompleteReason: null, updatedAt: Date.now() },
    ],
    writingSkill: { status: 'NONE' as any, cardHash: null, validatedCard: null, cardVersion: 0 },
    ...overrides,
  } as ProjectSnapshot
}

describe('ConsistencyChecker', () => {
  it('returns no issues for a healthy project', () => {
    const report = checkConsistency(makeSnapshot())
    expect(report.checkedChapters).toBe(2)
    expect(report.passed).toBe(true)
    expect(report.issues).toHaveLength(0)
  })

  it('detects chapter number gaps', () => {
    const snap = makeSnapshot({
      chapters: [
        { number: 1, title: '一', prose: 'x'.repeat(600), taskId: 't1', state: ChapterState.COMMITTED, summary: '摘要一摘要一摘要一', commitId: 'c1', incompleteReason: null, updatedAt: 1 },
        { number: 3, title: '三', prose: 'x'.repeat(600), taskId: 't3', state: ChapterState.COMMITTED, summary: '摘要三摘要三摘要三', commitId: 'c3', incompleteReason: null, updatedAt: 3 },
      ],
      storyState: { ...initialStoryState(), nextChapter: 4, committedChapters: [1, 3] },
    })
    const report = checkConsistency(snap)
    expect(report.issues.some(i => i.code === 'CHAPTER_GAP')).toBe(true)
  })

  it('detects short chapters', () => {
    const snap = makeSnapshot({
      chapters: [
        { number: 1, title: '一', prose: '太短了', taskId: 't1', state: ChapterState.COMMITTED, summary: '摘要一摘要一摘要一', commitId: 'c1', incompleteReason: null, updatedAt: 1 },
        { number: 2, title: '二', prose: 'x'.repeat(600), taskId: 't2', state: ChapterState.COMMITTED, summary: '摘要二摘要二摘要二', commitId: 'c2', incompleteReason: null, updatedAt: 2 },
      ],
    })
    const report = checkConsistency(snap)
    expect(report.issues.some(i => i.code === 'SHORT_CHAPTER' && i.chapter === 1)).toBe(true)
  })

  it('detects blocking draft state', () => {
    const snap = makeSnapshot({
      chapters: [
        { number: 1, title: '一', prose: 'x'.repeat(600), taskId: 't1', state: ChapterState.COMMITTED, summary: '摘要一摘要一摘要一', commitId: 'c1', incompleteReason: null, updatedAt: 1 },
        { number: 2, title: '二', prose: 'x'.repeat(600), taskId: 't2', state: ChapterState.PAUSED, summary: null, commitId: null, incompleteReason: 'TRUNCATED_LENGTH', updatedAt: 2 },
        { number: 3, title: '三', prose: 'x'.repeat(600), taskId: 't3', state: ChapterState.COMMITTED, summary: '摘要三摘要三摘要三', commitId: 'c3', incompleteReason: null, updatedAt: 3 },
      ],
      storyState: { ...initialStoryState(), nextChapter: 4, committedChapters: [1, 3] },
    })
    const report = checkConsistency(snap)
    expect(report.issues.some(i => i.code === 'BLOCKING_DRAFT')).toBe(true)
    expect(report.passed).toBe(false)
  })

  it('detects missing summaries', () => {
    const snap = makeSnapshot({
      chapters: [
        { number: 1, title: '一', prose: 'x'.repeat(600), taskId: 't1', state: ChapterState.COMMITTED, summary: '', commitId: 'c1', incompleteReason: null, updatedAt: 1 },
        { number: 2, title: '二', prose: 'x'.repeat(600), taskId: 't2', state: ChapterState.COMMITTED, summary: '摘要二摘要二摘要二', commitId: 'c2', incompleteReason: null, updatedAt: 2 },
      ],
    })
    const report = checkConsistency(snap)
    expect(report.issues.some(i => i.code === 'MISSING_SUMMARY' && i.chapter === 1)).toBe(true)
  })

  it('detects duplicate titles', () => {
    const snap = makeSnapshot({
      chapters: [
        { number: 1, title: '相同标题', prose: 'x'.repeat(600), taskId: 't1', state: ChapterState.COMMITTED, summary: '摘要一摘要一摘要一', commitId: 'c1', incompleteReason: null, updatedAt: 1 },
        { number: 2, title: '相同标题', prose: 'x'.repeat(600), taskId: 't2', state: ChapterState.COMMITTED, summary: '摘要二摘要二摘要二', commitId: 'c2', incompleteReason: null, updatedAt: 2 },
      ],
    })
    const report = checkConsistency(snap)
    expect(report.issues.some(i => i.code === 'DUPLICATE_TITLE')).toBe(true)
  })

  it('detects nextChapter mismatch', () => {
    const snap = makeSnapshot({
      storyState: { ...initialStoryState(), nextChapter: 5, committedChapters: [1, 2] },
    })
    const report = checkConsistency(snap)
    expect(report.issues.some(i => i.code === 'NEXT_CHAPTER_MISMATCH')).toBe(true)
  })

  it('passes with no chapters', () => {
    const snap = makeSnapshot({
      chapters: [],
      storyState: { ...initialStoryState(), nextChapter: 1, committedChapters: [] },
    })
    const report = checkConsistency(snap)
    expect(report.checkedChapters).toBe(0)
    expect(report.passed).toBe(true)
  })
})
