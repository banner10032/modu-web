/**
 * 连续性上下文构建器 + 纯本地校验 — 从 Kotlin S2Continuity.kt 翻译。
 * 无任何模型调用或状态变更。
 */

import { type Chapter, type ChapterTask, ContentScale, type ContentScale as ContentScaleType, PlotPace, type PlotPace as PlotPaceType, type PlanItem, type ProjectSnapshot, type StoryState, WritingSkillStatus } from './domain'

const MAX_PREVIOUS_TAIL_CHARS = 6000
const MAX_RECENT_SUMMARIES = 5

export class ContextBuilder {
  constructor(
    private maximumPreviousTailCharacters = MAX_PREVIOUS_TAIL_CHARS,
    private maximumRecentSummaries = MAX_RECENT_SUMMARIES,
  ) {}

  build(snapshot: ProjectSnapshot, item: PlanItem, taskId: string): ChapterTask {
    if (item.chapter !== snapshot.storyState.nextChapter) throw new Error('CHAPTER_SEQUENCE_INVALID')

    const previousChapter = snapshot.chapters
      .filter(c => c.number < item.chapter)
      .sort((a, b) => b.number - a.number)[0]

    const recentSummaries = snapshot.chapters
      .filter(c => c.number < item.chapter)
      .sort((a, b) => b.number - a.number)
      .map(c => c.summary)
      .filter((s): s is string => s != null)
      .slice(0, this.maximumRecentSummaries)
      .reverse()
      .map(s => s.slice(0, 1000))

    const povCharacterId = item.involvedEntityIds.find(id => id.startsWith('char_')) ?? 'char_protagonist'

    const writingCard = snapshot.writingSkill.status === WritingSkillStatus.ACTIVE
      ? snapshot.writingSkill.qualityCard
      : null

    return {
      taskId,
      projectId: snapshot.project.id,
      chapter: item.chapter,
      baseRevision: snapshot.storyState.revision,
      title: item.title,
      goal: item.goal.slice(0, 800),
      previousTail: previousChapter?.prose.slice(-this.maximumPreviousTailCharacters) ?? '',
      povCharacterId,
      allowedEntityIds: [povCharacterId, ...item.involvedEntityIds].filter((v, i, a) => a.indexOf(v) === i),
      hardFacts: [
        `题材：${snapshot.project.genre}`,
        `核心设定：${snapshot.project.premise}`,
        `主角：${snapshot.project.protagonist}`,
        `基调：${snapshot.project.tone}`,
        `进入状态：${item.entryState}`,
      ].map(s => s.slice(0, 500)),
      recentSummaries,
      openThreads: [],
      mustDo: [item.goal, item.mustChange, item.exitHook].map(s => s.slice(0, 500)),
      mustNotDo: item.mustNotRepeatEventKeys.map(key => `不得重复一次性事件：${key}`.slice(0, 500)),
      recentEventKeys: [...new Set(snapshot.storyState.recentEventKeys)],
      qualityCardId: writingCard ? `project-quality-card-v${writingCard.version}` : 'prose-quality-card-zh-v1',
      writingQualityCard: writingCard,
      contentScale: snapshot.project.contentScale,
      settlementRepairHint: null,
      plotPace: snapshot.project.plotPace,
    }
  }
}

// ─── 计划窗口 ───────────────────────────────────────────────

export function planWindowNeedsRefresh(remainingItems: number): boolean {
  return remainingItems >= 1 && remainingItems <= 2
}

// ─── 硬约束违反类型 ──────────────────────────────────────────

export enum HardViolation {
  DEAD_CHARACTER_PRESENT = 'DEAD_CHARACTER_PRESENT',
  POV_NOT_PRESENT = 'POV_NOT_PRESENT',
  ENTITY_NOT_ALLOWED = 'ENTITY_NOT_ALLOWED',
  CHAPTER_SEQUENCE_INVALID = 'CHAPTER_SEQUENCE_INVALID',
  UNPLANTED_FORESHADOW_PAYOFF = 'UNPLANTED_FORESHADOW_PAYOFF',
  UNIQUE_ITEM_CONFLICT = 'UNIQUE_ITEM_CONFLICT',
  UNKNOWN_KNOWLEDGE_USED = 'UNKNOWN_KNOWLEDGE_USED',
  MUTATION_WITHOUT_EVENT = 'MUTATION_WITHOUT_EVENT',
  ONE_TIME_EVENT_REPLAY = 'ONE_TIME_EVENT_REPLAY',
}

export const ONE_TIME_EVENT_REPLAY = HardViolation.ONE_TIME_EVENT_REPLAY
