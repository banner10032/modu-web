import { describe, it, expect } from 'vitest'
import { ContextBuilder, planWindowNeedsRefresh } from '../core/continuity'
import type { ProjectSnapshot, PlanItem } from '../core/domain'
import { ChapterState, ContentScale, PlotPace, WritingSkillStatus, emptyWritingSkillState } from '../core/domain'

function makeSnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    project: {
      id: 'test_project', title: '测试小说', genre: '玄幻', protagonist: '林岑',
      tone: '克制冷峻', premise: '测试核心设定', createdAt: '2026-01-01T00:00:00Z',
      contentScale: ContentScale.QING_XU, plotPace: PlotPace.BALANCED,
    },
    storyState: { revision: 0, nextChapter: 1, committedChapters: [], recentEventKeys: [] },
    plan: [],
    chapters: [],
    writingSkill: emptyWritingSkillState(),
    ...overrides,
  }
}

function makePlan(start: number, count: number): PlanItem[] {
  return Array.from({ length: count }, (_, i) => ({
    chapter: start + i,
    title: `第${start + i}章`,
    goal: `目标${start + i}`,
    entryState: '承接上一章',
    mustChange: `变化${start + i}`,
    exitHook: `钩子${start + i}`,
    involvedEntityIds: [],
    mustNotRepeatEventKeys: [],
  }))
}

describe('ContextBuilder', () => {
  const builder = new ContextBuilder()

  it('builds task for first chapter', () => {
    const snapshot = makeSnapshot({ plan: makePlan(1, 8) })
    const item = snapshot.plan[0]
    const task = builder.build(snapshot, item, 'task_abc123')
    expect(task.taskId).toBe('task_abc123')
    expect(task.chapter).toBe(1)
    expect(task.baseRevision).toBe(0)
    expect(task.previousTail).toBe('')
    expect(task.povCharacterId).toBe('char_protagonist')
    expect(task.contentScale).toBe(ContentScale.QING_XU)
    expect(task.plotPace).toBe(PlotPace.BALANCED)
    expect(task.hardFacts).toContain('题材：玄幻')
    expect(task.hardFacts).toContain('主角：林岑')
  })

  it('includes previous chapter tail', () => {
    const snapshot = makeSnapshot({
      storyState: { revision: 1, nextChapter: 2, committedChapters: [1], recentEventKeys: [] },
      plan: makePlan(1, 8),
      chapters: [{
        number: 1, title: '第一章', taskId: 'task_old', prose: '这是第一章的正文内容，用于测试尾部截取。',
        state: ChapterState.COMMITTED, summary: '第一章摘要', commitId: 'commit_1', incompleteReason: null,
      }],
    })
    const item = snapshot.plan[1]
    const task = builder.build(snapshot, item, 'task_new')
    expect(task.chapter).toBe(2)
    expect(task.baseRevision).toBe(1)
    expect(task.previousTail).toContain('正文内容')
    expect(task.recentSummaries).toEqual(['第一章摘要'])
  })

  it('throws on chapter sequence mismatch', () => {
    const snapshot = makeSnapshot({ plan: makePlan(1, 8) })
    const item = { ...snapshot.plan[0], chapter: 5 }
    expect(() => builder.build(snapshot, item, 'task_x')).toThrow('CHAPTER_SEQUENCE_INVALID')
  })

  it('uses project quality card when active', () => {
    const snapshot = makeSnapshot({
      writingSkill: {
        status: WritingSkillStatus.ACTIVE,
        displayName: '测试卡', format: null, sourceSha256: null, importedAt: null,
        qualityCard: { name: '测试', version: 1, rules: ['规则1'], avoid: [], preferredTerms: [], sha256: 'abc' },
        errorCode: null,
      },
      plan: makePlan(1, 8),
    })
    const task = builder.build(snapshot, snapshot.plan[0], 'task_q')
    expect(task.qualityCardId).toBe('project-quality-card-v1')
    expect(task.writingQualityCard?.name).toBe('测试')
  })
})

describe('planWindowNeedsRefresh', () => {
  it('returns true for 1-2 remaining', () => {
    expect(planWindowNeedsRefresh(0)).toBe(false)
    expect(planWindowNeedsRefresh(1)).toBe(true)
    expect(planWindowNeedsRefresh(2)).toBe(true)
    expect(planWindowNeedsRefresh(3)).toBe(false)
    expect(planWindowNeedsRefresh(8)).toBe(false)
  })
})
