import { describe, it, expect } from 'vitest'
import { FakeProvider } from '../core/fake-provider'
import { GenerationCoordinator, ChapterRoute } from '../core/generation-coordinator'
import type { NovelRepository, Project, ProjectSnapshot, PlanItem, Chapter, ChapterTask, PendingCommit, ContentScale, PlotPace, WritingSkillImport, WritingQualityCard } from '../core/domain'
import { ChapterState, ContentScale as ContentScaleEnum, PlotPace as PlotPaceEnum, emptyWritingSkillState, initialStoryState } from '../core/domain'

class InMemoryRepository implements NovelRepository {
  projects = new Map<string, { project: Project; storyState: any; plan: PlanItem[]; chapters: Chapter[]; writingSkill: any }>()
  pendingCommits = new Map<string, PendingCommit>()

  async createProject(project: Project, plan: PlanItem[], writingSkill?: WritingSkillImport): Promise<ProjectSnapshot> {
    this.projects.set(project.id, {
      project, storyState: initialStoryState(), plan,
      chapters: [], writingSkill: emptyWritingSkillState(),
    })
    const snap = await this.loadProject(project.id)
    if (!snap) throw new Error('PROJECT_NOT_FOUND')
    return snap
  }
  async listProjects(): Promise<ProjectSnapshot[]> { return Array.from(this.projects.values()).map(p => this.toSnapshot(p)) }
  async loadProject(projectId: string): Promise<ProjectSnapshot | null> {
    const p = this.projects.get(projectId)
    return p ? this.toSnapshot(p) : null
  }
  async replacePlan(projectId: string, _rev: number, plan: PlanItem[]): Promise<ProjectSnapshot> {
    const p = this.projects.get(projectId)!
    p.plan = plan
    return this.toSnapshot(p)
  }
  async deleteProject(): Promise<boolean> { return true }
  async discardProject(): Promise<boolean> { return true }
  async saveWritingSkill(): Promise<ProjectSnapshot> { throw new Error('not implemented') }
  async removeWritingSkill(): Promise<ProjectSnapshot> { throw new Error('not implemented') }
  async saveContentScale(): Promise<ProjectSnapshot> { throw new Error('not implemented') }
  async savePlotPace(): Promise<ProjectSnapshot> { throw new Error('not implemented') }
  async saveReadableDraft(projectId: string, task: ChapterTask, prose: string): Promise<Chapter> {
    const p = this.projects.get(projectId)!
    const chapter: Chapter = { number: task.chapter, title: task.title, taskId: task.taskId, prose, state: ChapterState.READABLE_DRAFT, summary: null, commitId: null, incompleteReason: null }
    const existing = p.chapters.findIndex(c => c.number === task.chapter)
    if (existing >= 0) p.chapters[existing] = chapter
    else p.chapters.push(chapter)
    return chapter
  }
  async saveIncompleteDraft(projectId: string, task: ChapterTask, prose: string, reason: string): Promise<Chapter> {
    const draft = await this.saveReadableDraft(projectId, task, prose)
    return { ...draft, state: ChapterState.PAUSED, incompleteReason: reason }
  }
  async writePendingCommit(commit: PendingCommit): Promise<void> { this.pendingCommits.set(commit.commitId, commit) }
  async applyPendingCommit(commitId: string): Promise<void> {
    const commit = this.pendingCommits.get(commitId)
    if (!commit) return
    const p = this.projects.get(commit.projectId)!
    if (p.storyState.revision === commit.baseRevision) {
      p.storyState = commit.newState
      p.plan = commit.newPlan
      const idx = p.chapters.findIndex(c => c.number === commit.chapter)
      if (idx >= 0) p.chapters[idx] = commit.chapterMeta
    }
    this.pendingCommits.delete(commitId)
  }
  async recoverPendingCommits(): Promise<string[]> {
    const ids: string[] = []
    for (const id of [...this.pendingCommits.keys()]) { await this.applyPendingCommit(id); ids.push(id) }
    return ids
  }
  private toSnapshot(p: { project: Project; storyState: any; plan: PlanItem[]; chapters: Chapter[]; writingSkill: any }): ProjectSnapshot {
    return { project: p.project, storyState: p.storyState, plan: p.plan, chapters: p.chapters, writingSkill: p.writingSkill }
  }
}

function makePlan(start: number, count: number): PlanItem[] {
  return Array.from({ length: count }, (_, i) => ({
    chapter: start + i, title: `第${start + i}章`, goal: `目标${start + i}`,
    entryState: '承接', mustChange: `变化${start + i}`, exitHook: `钩子${start + i}`,
    involvedEntityIds: [], mustNotRepeatEventKeys: [],
  }))
}

describe('GenerationCoordinator', () => {
  it('generates and commits a chapter with fake provider', async () => {
    const repo = new InMemoryRepository()
    const provider = new FakeProvider()
    const coordinator = new GenerationCoordinator(repo, provider)

    const project: Project = {
      id: 'gen_test', title: '生成测试', genre: '玄幻', protagonist: '林岑',
      tone: '克制冷峻', premise: '测试', createdAt: '2026-01-01T00:00:00Z',
      contentScale: ContentScaleEnum.QING_XU, plotPace: PlotPaceEnum.BALANCED,
    }
    await repo.createProject(project, makePlan(1, 8))

    const result = await coordinator.generateNextChapter('gen_test')
    expect(result.type).toBe('Committed')
    if (result.type === 'Committed') {
      expect(result.proseCalls).toBe(1)
      expect(result.settlementCalls).toBe(1)
      expect(result.chapter.state).toBe(ChapterState.COMMITTED)
      expect(result.chapter.commitId).toBeTruthy()
    }
    expect(provider.proseCalls).toBe(1)
    expect(provider.settlementCalls).toBe(1)

    const snap = await repo.loadProject('gen_test')
    expect(snap!.storyState.nextChapter).toBe(2)
    expect(snap!.storyState.committedChapters).toEqual([1])
    expect(snap!.storyState.revision).toBe(1)
    expect(snap!.chapters[0].state).toBe(ChapterState.COMMITTED)
  })

  it('rejects when plan exhausted', async () => {
    const repo = new InMemoryRepository()
    const provider = new FakeProvider()
    const coordinator = new GenerationCoordinator(repo, provider)

    await repo.createProject({
      id: 'exhausted', title: '已用完', genre: '玄幻', protagonist: '林岑',
      tone: '克制冷峻', premise: '测试', createdAt: '2026-01-01T00:00:00Z',
      contentScale: ContentScaleEnum.QING_XU, plotPace: PlotPaceEnum.BALANCED,
    }, makePlan(1, 8))
    // 修改 storyState 使 nextChapter 超出 plan
    const p = (repo as any).projects.get('exhausted')
    p.storyState.nextChapter = 9

    const result = await coordinator.generateNextChapter('exhausted')
    expect(result.type).toBe('Rejected')
    if (result.type === 'Rejected') expect(result.reason).toBe('PLAN_EXHAUSTED')
  })

  it('prevents regenerating committed chapter', async () => {
    const repo = new InMemoryRepository()
    const provider = new FakeProvider()
    const coordinator = new GenerationCoordinator(repo, provider)

    await repo.createProject({
      id: 'committed_test', title: '已提交', genre: '玄幻', protagonist: '林岑',
      tone: '克制冷峻', premise: '测试', createdAt: '2026-01-01T00:00:00Z',
      contentScale: ContentScaleEnum.QING_XU, plotPace: PlotPaceEnum.BALANCED,
    }, makePlan(1, 8))

    await coordinator.generateNextChapter('committed_test')
    // 强制回到第1章
    const p = (repo as any).projects.get('committed_test')
    p.storyState.nextChapter = 1
    const result = await coordinator.generateNextChapter('committed_test')
    expect(result.type).toBe('Rejected')
  })
})

describe('SequentialBatch', () => {
  it('runs multiple chapters sequentially', async () => {
    const { runSequentialBatch } = await import('../core/sequential-batch')
    let count = 0
    const result = await runSequentialBatch(3, async () => {
      count++
      return { type: 'Committed' as const, chapter: {} as any, proseCalls: 1, settlementCalls: 1 }
    })
    expect(result.completed).toBe(3)
    expect(result.requested).toBe(3)
    expect(result.terminal.type).toBe('Committed')
  })

  it('stops on failure', async () => {
    const { runSequentialBatch } = await import('../core/sequential-batch')
    let count = 0
    const result = await runSequentialBatch(3, async () => {
      count++
      if (count === 2) return { type: 'Rejected' as const, reason: 'FAIL' }
      return { type: 'Committed' as const, chapter: {} as any, proseCalls: 1, settlementCalls: 1 }
    })
    expect(result.completed).toBe(1)
    expect(result.terminal.type).toBe('Rejected')
  })
})
