/**
 * 章节生成协调器 — 从 Kotlin S0GenerationCoordinator.kt 翻译。
 * 普通章节恰好两次模型调用：正文一次、结算一次。
 */

import type {
  Chapter, ChapterTask, GenerationResult, NovelRepository,
  PendingCommit, Settlement, SettlementEvent, StoryEvent, StoryState, TextGenerationProvider,
} from './domain'
import { ChapterState } from './domain'
import type { JobStage } from './generation-job'
import { ContextBuilder } from './continuity'
import { ONE_TIME_EVENT_REPLAY } from './continuity'
import { ProviderErrorCode, ProviderException, providerError, INCOMPLETE_PROSE_CODES } from './provider-contract'

type Checkpoint = (task: ChapterTask, stage: JobStage) => void

function randomId(prefix: string, length = 16): string {
  const hex = '0123456789abcdef'
  let id = ''
  for (let i = 0; i < length; i++) id += hex[Math.floor(Math.random() * 16)]
  return `${prefix}${id}`
}

export class ChapterRoute {
  constructor(
    private repository: NovelRepository,
    private contextBuilder = new ContextBuilder(),
  ) {}

  async permit(projectId: string): Promise<{ ok: true; task: ChapterTask } | { ok: false; reason: string }> {
    try {
      const snapshot = await this.repository.loadProject(projectId)
      if (!snapshot) throw new Error('PROJECT_NOT_FOUND')
      const item = snapshot.plan.find(p => p.chapter === snapshot.storyState.nextChapter)
      if (!item) throw new Error('PLAN_EXHAUSTED')
      if (item.chapter !== snapshot.storyState.nextChapter) throw new Error('CHAPTER_SEQUENCE_INVALID')
      if (item.chapter > 1) {
        if (!snapshot.storyState.committedChapters.includes(item.chapter - 1)) {
          throw new Error('PREVIOUS_CHAPTER_NOT_COMMITTED')
        }
      }
      const existing = snapshot.chapters.find(c => c.number === item.chapter)
      if (existing && existing.state !== ChapterState.PAUSED) {
        throw new Error(existing.state === ChapterState.COMMITTED ? 'CHAPTER_ALREADY_COMMITTED' : 'EXISTING_DRAFT_REQUIRES_SETTLEMENT')
      }
      const task = this.contextBuilder.build(snapshot, item, randomId('task_'))
      return { ok: true, task }
    } catch (e) {
      return { ok: false, reason: (e as Error).message || 'UNKNOWN' }
    }
  }

  async permitSettlement(projectId: string): Promise<{ ok: true; task: ChapterTask; draft: Chapter } | { ok: false; reason: string }> {
    try {
      const snapshot = await this.repository.loadProject(projectId)
      if (!snapshot) throw new Error('PROJECT_NOT_FOUND')
      const item = snapshot.plan.find(p => p.chapter === snapshot.storyState.nextChapter)
      if (!item) throw new Error('PLAN_EXHAUSTED')
      const draft = snapshot.chapters.find(c => c.number === item.chapter)
      if (!draft) throw new Error('READABLE_DRAFT_NOT_FOUND')
      if (draft.state !== ChapterState.READABLE_DRAFT && draft.state !== ChapterState.NEEDS_REVIEW) {
        throw new Error('READABLE_DRAFT_NOT_FOUND')
      }
      const task = this.contextBuilder.build(snapshot, item, draft.taskId)
      return { ok: true, task, draft }
    } catch (e) {
      return { ok: false, reason: (e as Error).message || 'UNKNOWN' }
    }
  }
}

export class GenerationCoordinator {
  private route: ChapterRoute

  constructor(
    private repository: NovelRepository,
    private provider: TextGenerationProvider,
    route?: ChapterRoute,
  ) {
    this.route = route ?? new ChapterRoute(repository)
  }

  async generateNextChapter(projectId: string, checkpoint: Checkpoint = () => {}): Promise<GenerationResult> {
    const permitted = await this.route.permit(projectId)
    if (!permitted.ok) return { type: 'Rejected', reason: permitted.reason }
    const task = permitted.task
    checkpoint(task, 'PREPARE' as JobStage)
    checkpoint(task, 'PROSE_REQUEST' as JobStage)

    let streamedProse = ''
    let prose: string
    try {
      prose = await this.provider.streamProse(task, chunk => { streamedProse += chunk })
    } catch (failure) {
      const exception = failure as ProviderException
      const incompleteCode = exception?.failure?.code
      if (incompleteCode && INCOMPLETE_PROSE_CODES.has(incompleteCode) && streamedProse.trim()) {
        const draft = await this.repository.saveIncompleteDraft(projectId, task, streamedProse, incompleteCode)
        checkpoint(task, 'PROSE_SAVED' as JobStage)
        return { type: 'IncompleteDraft', chapter: draft, reason: incompleteCode }
      }
      return { type: 'Rejected', reason: `PROSE_FAILED:${(failure as Error).message || ''}` }
    }

    if (!prose.trim()) return { type: 'Rejected', reason: 'PROSE_EMPTY' }
    const draft = await this.repository.saveReadableDraft(projectId, task, prose)
    checkpoint(task, 'PROSE_SAVED' as JobStage)
    return this.settleAndCommit(projectId, task, draft, prose, 1, checkpoint)
  }

  async retrySettlement(projectId: string, settlementRepairHint?: string, checkpoint: Checkpoint = () => {}): Promise<GenerationResult> {
    const permitted = await this.route.permitSettlement(projectId)
    if (!permitted.ok) return { type: 'Rejected', reason: permitted.reason }
    const { task, draft } = permitted
    const repairTask = { ...task, settlementRepairHint: settlementRepairHint?.slice(0, 240) ?? null }
    checkpoint(repairTask, 'PROSE_SAVED' as JobStage)
    return this.settleAndCommit(projectId, repairTask, draft, draft.prose, 0, checkpoint)
  }

  private async settleAndCommit(
    projectId: string,
    task: ChapterTask,
    draft: Chapter,
    prose: string,
    proseCalls: number,
    checkpoint: Checkpoint,
  ): Promise<GenerationResult> {
    checkpoint(task, 'SETTLEMENT_REQUEST' as JobStage)
    let settlement: Settlement
    try {
      settlement = await this.provider.completeSettlement(task, prose)
    } catch (failure) {
      return { type: 'ReadableDraft', chapter: draft, reason: `SETTLEMENT_FAILED:${(failure as Error).message || ''}` }
    }

    if (settlement.taskId !== task.taskId || settlement.chapter !== task.chapter || settlement.baseRevision !== task.baseRevision) {
      return { type: 'ReadableDraft', chapter: draft, reason: 'SETTLEMENT_CONTRACT_INVALID' }
    }

    checkpoint(task, 'VALIDATE' as JobStage)
    const snapshot = await this.repository.loadProject(projectId)
    if (!snapshot) return { type: 'ReadableDraft', chapter: draft, reason: 'PROJECT_NOT_FOUND_AFTER_DRAFT' }

    const settlementEvents = settlement.events.length > 0
      ? settlement.events
      : [{
          eventId: randomId('event_'),
          eventKey: settlement.eventKey,
          description: settlement.eventDescription,
          participants: [],
          stateTargets: [],
        }]

    if (settlementEvents.some(e => snapshot.storyState.recentEventKeys.includes(e.eventKey))) {
      return { type: 'ReadableDraft', chapter: draft, reason: ONE_TIME_EVENT_REPLAY }
    }

    const plan = snapshot.plan.filter(p => p.chapter !== task.chapter)
    const nextState: StoryState = {
      revision: task.baseRevision + 1,
      nextChapter: task.chapter + 1,
      committedChapters: [...new Set([...snapshot.storyState.committedChapters, task.chapter])].sort((a, b) => a - b),
      recentEventKeys: [...new Set([...snapshot.storyState.recentEventKeys, ...settlementEvents.map(e => e.eventKey)])].slice(-100),
    }

    const commitId = randomId('commit_')
    const events: StoryEvent[] = settlementEvents.map((event, index) => ({
      eventId: `event_${commitId.replace('commit_', '')}_${index + 1}`,
      commitId,
      chapter: task.chapter,
      eventKey: event.eventKey,
      payload: event.description,
    }))

    const committedChapter: Chapter = {
      ...draft,
      state: ChapterState.COMMITTED,
      summary: settlement.summary,
      commitId,
      incompleteReason: null,
    }

    checkpoint(task, 'COMMIT' as JobStage)
    const pendingCommit: PendingCommit = {
      commitId,
      projectId,
      chapter: task.chapter,
      baseRevision: task.baseRevision,
      targetRevision: nextState.revision,
      newState: nextState,
      newPlan: plan,
      events,
      chapterMeta: committedChapter,
    }
    await this.repository.writePendingCommit(pendingCommit)
    await this.repository.applyPendingCommit(commitId)
    checkpoint(task, 'DONE' as JobStage)
    return { type: 'Committed', chapter: committedChapter, proseCalls, settlementCalls: 1 }
  }
}
