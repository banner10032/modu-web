/**
 * IndexedDB 仓储实现 — 从 Kotlin FileS0NovelRepository.kt 翻译。
 * 用 IndexedDB 替代文件系统存储；原子性通过事务保证。
 */

import {
  type Chapter, ChapterState, type ChapterState as ChapterStateType, type ChapterTask, ContentScale, type ContentScale as ContentScaleType,
  type NovelRepository, type PendingCommit,
  type PlanItem, PlotPace, type PlotPace as PlotPaceType, type Project, type ProjectSnapshot, type StoryEvent, type StoryState,
  type WritingQualityCard, type WritingSkillFormat, type WritingSkillImport, type WritingSkillState, WritingSkillStatus,
  emptyWritingSkillState, initialStoryState,
} from '../core/domain'
import { sha256, sha256Bytes, randomId } from './crypto'
import { validateWritingSkillImport } from './writing-skill'

const DB_NAME = 'zhijuan'
const DB_VERSION = 1
const STORE_PROJECTS = 'projects'
const STORE_CHAPTERS = 'chapters'
const STORE_EVENTS = 'events'
const STORE_PENDING_COMMITS = 'pendingCommits'
const STORE_COMPLETED_COMMITS = 'completedCommits'
const STORE_JOBS = 'jobs'

const ID_PATTERN = /^[A-Za-z0-9_-]{3,80}$/
const PLAN_WINDOW_MIN = 8
const PLAN_WINDOW_MAX = 10
const MAX_SKILL_SOURCE_BYTES = 256 * 1024
const MAX_SKILL_METADATA_BYTES = 16 * 1024
const SHA256_PATTERN = /^[a-f0-9]{64}$/

class StorageError extends Error {
  constructor(message: string) { super(message); this.name = 'StorageError' }
}

// ─── IndexedDB 底层 ─────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'projectId' })
      }
      if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
        const store = db.createObjectStore(STORE_CHAPTERS, { keyPath: ['projectId', 'number'] })
        store.createIndex('byProject', 'projectId')
      }
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const store = db.createObjectStore(STORE_EVENTS, { keyPath: ['projectId', 'eventId'] })
        store.createIndex('byProject', 'projectId')
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_COMMITS)) {
        db.createObjectStore(STORE_PENDING_COMMITS, { keyPath: 'commitId' })
      }
      if (!db.objectStoreNames.contains(STORE_COMPLETED_COMMITS)) {
        db.createObjectStore(STORE_COMPLETED_COMMITS, { keyPath: 'commitId' })
      }
      if (!db.objectStoreNames.contains(STORE_JOBS)) {
        db.createObjectStore(STORE_JOBS, { keyPath: 'projectId' })
      }
    }
  })
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = fn(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))
}

function txAll<T>(store: string, mode: IDBTransactionMode): Promise<T[]> {
  return tx<T[]>(store, mode, s => s.getAll() as IDBRequest<T[]>)
}

// ─── 存储记录类型 ───────────────────────────────────────────

interface ProjectRecord {
  projectId: string
  project: Project
  storyState: StoryState
  plan: PlanItem[]
  writingSkill: WritingSkillState
}

interface ChapterRecord {
  projectId: string
  number: number
  title: string
  taskId: string
  prose: string
  state: ChapterState
  summary: string | null
  commitId: string | null
  incompleteReason: string | null
  updatedAt: string
}

interface EventRecord {
  projectId: string
  eventId: string
  commitId: string
  chapter: number
  eventKey: string
  payload: string
}

// ─── 仓储实现 ───────────────────────────────────────────────

export class IdbNovelRepository implements NovelRepository {
  async createProject(project: Project, plan: PlanItem[], writingSkill?: WritingSkillImport): Promise<ProjectSnapshot> {
    if (!ID_PATTERN.test(project.id)) throw new StorageError('PROJECT_ID_INVALID')
    if (!project.title.trim()) throw new StorageError('PROJECT_TITLE_REQUIRED')
    this.validatePlanWindow(plan, 1)

    const existing = await tx<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', s => s.get(project.id))
    if (existing) throw new StorageError('PROJECT_ALREADY_EXISTS')

    if (writingSkill) writingSkill = validateWritingSkillImport(writingSkill)

    const record: ProjectRecord = {
      projectId: project.id,
      project,
      storyState: initialStoryState(),
      plan,
      writingSkill: writingSkill ? this.writingSkillToState(writingSkill) : emptyWritingSkillState(),
    }
    await tx(STORE_PROJECTS, 'readwrite', s => s.put(record))
    const snap = await this.loadProject(project.id)
    if (!snap) throw new StorageError('PROJECT_PROMOTE_FAILED')
    return snap
  }

  async listProjects(): Promise<ProjectSnapshot[]> {
    const records = await txAll<ProjectRecord>(STORE_PROJECTS, 'readonly')
    const snapshots: ProjectSnapshot[] = []
    for (const record of records) {
      const snap = await this.recordToSnapshot(record)
      if (snap) snapshots.push(snap)
    }
    return snapshots.sort((a, b) => a.project.createdAt.localeCompare(b.project.createdAt))
  }

  async loadProject(projectId: string): Promise<ProjectSnapshot | null> {
    if (!ID_PATTERN.test(projectId)) return null
    const record = await tx<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', s => s.get(projectId))
    if (!record) return null
    return this.recordToSnapshot(record)
  }

  private async requireSnapshot(projectId: string): Promise<ProjectSnapshot> {
    const snap = await this.loadProject(projectId)
    if (!snap) throw new StorageError('PROJECT_NOT_FOUND')
    return snap
  }

  private async recordToSnapshot(record: ProjectRecord): Promise<ProjectSnapshot | null> {
    try {
      const chapters = await this.readChapters(record.projectId)
      return {
        project: record.project,
        storyState: record.storyState,
        plan: record.plan,
        chapters,
        writingSkill: record.writingSkill,
      }
    } catch {
      throw new StorageError(`PROJECT_CORRUPT`)
    }
  }

  async replacePlan(projectId: string, expectedRevision: number, plan: PlanItem[]): Promise<ProjectSnapshot> {
    const snapshot = await this.loadProject(projectId)
    if (!snapshot) throw new StorageError('PROJECT_NOT_FOUND')
    if (snapshot.storyState.revision !== expectedRevision) throw new StorageError('BASE_REVISION_MISMATCH')
    if (snapshot.chapters.some(c => c.state !== ChapterState.COMMITTED)) throw new StorageError('DRAFT_REQUIRES_SETTLEMENT')
    this.validatePlanWindow(plan, snapshot.storyState.nextChapter)

    const record = await tx<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', s => s.get(projectId))
    if (!record) throw new StorageError('PROJECT_NOT_FOUND')
    record.plan = plan
    await tx(STORE_PROJECTS, 'readwrite', s => s.put(record))
    const snap = await this.loadProject(projectId)
    if (!snap) throw new StorageError('PROJECT_NOT_FOUND')
    return snap
  }

  async deleteProject(projectId: string): Promise<boolean> {
    if (!ID_PATTERN.test(projectId)) return false
    const snapshot = await this.loadProject(projectId)
    if (!snapshot) return false
    // 检查是否有活跃任务或待提交
    const job = await tx(STORE_JOBS, 'readonly', s => s.get(projectId))
    if (job) throw new StorageError('PROJECT_DELETE_ACTIVE_JOB')
    await this.deleteAllProjectData(projectId)
    return true
  }

  async discardProject(projectId: string): Promise<boolean> {
    if (!ID_PATTERN.test(projectId)) return false
    const snapshot = await this.loadProject(projectId)
    if (!snapshot) return false
    await this.deleteAllProjectData(projectId)
    return true
  }

  private async deleteAllProjectData(projectId: string): Promise<void> {
    await openDB().then(db => new Promise<void>((resolve, reject) => {
      const txn = db.transaction([STORE_PROJECTS, STORE_CHAPTERS, STORE_EVENTS, STORE_PENDING_COMMITS, STORE_COMPLETED_COMMITS, STORE_JOBS], 'readwrite')
      txn.objectStore(STORE_PROJECTS).delete(projectId)
      txn.objectStore(STORE_JOBS).delete(projectId)
      // 删除章节
      const chapterStore = txn.objectStore(STORE_CHAPTERS)
      const chapterIdx = chapterStore.index('byProject')
      chapterIdx.openCursor(IDBKeyRange.only(projectId)).onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result
        if (cursor) { cursor.delete(); cursor.continue() }
      }
      // 删除事件
      const eventStore = txn.objectStore(STORE_EVENTS)
      const eventIdx = eventStore.index('byProject')
      eventIdx.openCursor(IDBKeyRange.only(projectId)).onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result
        if (cursor) { cursor.delete(); cursor.continue() }
      }
      // 删除待提交和已完成提交
      const pendingStore = txn.objectStore(STORE_PENDING_COMMITS)
      pendingStore.openCursor().onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result
        if (cursor) {
          const val = cursor.value as PendingCommit
          if (val.projectId === projectId) cursor.delete()
          cursor.continue()
        }
      }
      const completedStore = txn.objectStore(STORE_COMPLETED_COMMITS)
      completedStore.openCursor().onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result
        if (cursor) {
          const val = cursor.value as PendingCommit
          if (val.projectId === projectId) cursor.delete()
          cursor.continue()
        }
      }
      txn.oncomplete = () => resolve()
      txn.onerror = () => reject(txn.error)
    }))
  }

  async saveWritingSkill(projectId: string, writingSkill: WritingSkillImport): Promise<ProjectSnapshot> {
    const record = await tx<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', s => s.get(projectId))
    if (!record) throw new StorageError('PROJECT_NOT_FOUND')
    const validated = validateWritingSkillImport(writingSkill)
    record.writingSkill = this.writingSkillToState(validated)
    await tx(STORE_PROJECTS, 'readwrite', s => s.put(record))
    return this.requireSnapshot(projectId)
  }

  async removeWritingSkill(projectId: string): Promise<ProjectSnapshot> {
    const record = await tx<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', s => s.get(projectId))
    if (!record) throw new StorageError('PROJECT_NOT_FOUND')
    record.writingSkill = emptyWritingSkillState()
    await tx(STORE_PROJECTS, 'readwrite', s => s.put(record))
    return this.requireSnapshot(projectId)
  }

  async saveContentScale(projectId: string, contentScale: ContentScale): Promise<ProjectSnapshot> {
    const record = await tx<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', s => s.get(projectId))
    if (!record) throw new StorageError('PROJECT_NOT_FOUND')
    record.project = { ...record.project, contentScale }
    await tx(STORE_PROJECTS, 'readwrite', s => s.put(record))
    return this.requireSnapshot(projectId)
  }

  async savePlotPace(projectId: string, plotPace: PlotPace): Promise<ProjectSnapshot> {
    const record = await tx<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', s => s.get(projectId))
    if (!record) throw new StorageError('PROJECT_NOT_FOUND')
    record.project = { ...record.project, plotPace }
    await tx(STORE_PROJECTS, 'readwrite', s => s.put(record))
    return this.requireSnapshot(projectId)
  }

  async saveReadableDraft(projectId: string, task: ChapterTask, prose: string): Promise<Chapter> {
    return this.saveDraft(projectId, task, prose, ChapterState.READABLE_DRAFT, null)
  }

  async saveIncompleteDraft(projectId: string, task: ChapterTask, prose: string, reason: string): Promise<Chapter> {
    if (!reason.trim()) throw new StorageError('INCOMPLETE_REASON_REQUIRED')
    return this.saveDraft(projectId, task, prose, ChapterState.PAUSED, reason)
  }

  private async saveDraft(
    projectId: string, task: ChapterTask, prose: string,
    state: ChapterState, incompleteReason: string | null,
  ): Promise<Chapter> {
    if (!prose.trim()) throw new StorageError('PROSE_EMPTY')
    const snapshot = await this.loadProject(projectId)
    if (!snapshot) throw new StorageError('PROJECT_NOT_FOUND')
    if (snapshot.storyState.revision !== task.baseRevision) throw new StorageError('BASE_REVISION_MISMATCH')

    const chapter: Chapter = {
      number: task.chapter,
      title: task.title,
      taskId: task.taskId,
      prose,
      state,
      summary: null,
      commitId: null,
      incompleteReason,
    }
    const record: ChapterRecord = {
      projectId,
      ...chapter,
      updatedAt: new Date().toISOString(),
    }
    await tx(STORE_CHAPTERS, 'readwrite', s => s.put(record))
    return chapter
  }

  async writePendingCommit(commit: PendingCommit): Promise<void> {
    await tx(STORE_PENDING_COMMITS, 'readwrite', s => s.put(commit))
  }

  async applyPendingCommit(commitId: string): Promise<void> {
    if (!ID_PATTERN.test(commitId)) return
    const commit = await tx<PendingCommit | undefined>(STORE_PENDING_COMMITS, 'readonly', s => s.get(commitId))
    if (!commit) return

    const record = await tx<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', s => s.get(commit.projectId))
    if (!record) throw new StorageError('PROJECT_NOT_FOUND')

    // 幂等：已经是目标版本则跳过
    if (record.storyState.revision === commit.baseRevision) {
      record.storyState = commit.newState
    } else if (record.storyState.revision === commit.targetRevision) {
      // 已应用过，跳过
    } else if (record.storyState.revision > commit.targetRevision) {
      throw new StorageError('COMMIT_BASE_MISMATCH')
    } else {
      throw new StorageError('COMMIT_BASE_MISMATCH')
    }

    record.plan = commit.newPlan
    await tx(STORE_PROJECTS, 'readwrite', s => s.put(record))

    // 追加事件
    await this.appendEvents(commit.projectId, commit.events)

    // 更新章节元数据
    const chapterRecord: ChapterRecord = {
      projectId: commit.projectId,
      ...commit.chapterMeta,
      updatedAt: new Date().toISOString(),
    }
    await tx(STORE_CHAPTERS, 'readwrite', s => s.put(chapterRecord))

    // 移动到已完成
    await tx(STORE_COMPLETED_COMMITS, 'readwrite', s => s.put(commit))
    await tx(STORE_PENDING_COMMITS, 'readwrite', s => s.delete(commitId))
  }

  async recoverPendingCommits(): Promise<string[]> {
    const pending = await txAll<PendingCommit>(STORE_PENDING_COMMITS, 'readonly')
    const commitIds: string[] = []
    for (const commit of pending) {
      await this.applyPendingCommit(commit.commitId)
      commitIds.push(commit.commitId)
    }
    await this.repairCompletedEventLogs()
    return commitIds
  }

  private async repairCompletedEventLogs(): Promise<void> {
    const completed = await txAll<PendingCommit>(STORE_COMPLETED_COMMITS, 'readonly')
    const byProject = new Map<string, PendingCommit[]>()
    for (const commit of completed) {
      if (!byProject.has(commit.projectId)) byProject.set(commit.projectId, [])
      byProject.get(commit.projectId)!.push(commit)
    }
    for (const [projectId, commits] of byProject) {
      commits.sort((a, b) => a.chapter - b.chapter || a.commitId.localeCompare(b.commitId))
      const events: StoryEvent[] = []
      for (const commit of commits) {
        commit.events.forEach((event, index) => {
          events.push({
            ...event,
            eventId: `event_${commit.commitId.replace('commit_', '')}_${index + 1}`,
          })
        })
      }
      if (events.length > 0) await this.appendEvents(projectId, events)
    }
  }

  private async appendEvents(projectId: string, events: StoryEvent[]): Promise<void> {
    const existing = await this.readEvents(projectId)
    const existingIds = new Set(existing.map(e => e.eventId))
    const existingIdentities = new Set(existing.map(e => `${e.commitId}|${e.eventKey}`))

    const accepted: StoryEvent[] = []
    for (const event of events) {
      const identity = `${event.commitId}|${event.eventKey}`
      if (existingIdentities.has(identity)) continue
      let candidate = event
      if (existingIds.has(candidate.eventId)) {
        candidate = { ...candidate, eventId: await this.collisionSafeEventId(candidate) }
        let salt = 1
        while (existingIds.has(candidate.eventId)) {
          candidate = { ...candidate, eventId: await this.collisionSafeEventId(candidate, salt++) }
        }
      }
      accepted.push(candidate)
      existingIds.add(candidate.eventId)
      existingIdentities.add(identity)
    }

    for (const event of accepted) {
      const record: EventRecord = {
        projectId,
        eventId: event.eventId,
        commitId: event.commitId,
        chapter: event.chapter,
        eventKey: event.eventKey,
        payload: event.payload,
      }
      await tx(STORE_EVENTS, 'readwrite', s => s.put(record))
    }
  }

  private async collisionSafeEventId(event: StoryEvent, salt = 0): Promise<string> {
    const seed = `${event.commitId}|${event.eventKey}|${salt}`
    return `event_${(await sha256(seed)).slice(0, 24)}`
  }

  private async readEvents(projectId: string): Promise<StoryEvent[]> {
    return openDB().then(db => new Promise<StoryEvent[]>((resolve, reject) => {
      const txn = db.transaction(STORE_EVENTS, 'readonly')
      const store = txn.objectStore(STORE_EVENTS)
      const idx = store.index('byProject')
      const req = idx.getAll(IDBKeyRange.only(projectId))
      req.onsuccess = () => resolve((req.result as EventRecord[]).map(r => ({
        eventId: r.eventId, commitId: r.commitId, chapter: r.chapter, eventKey: r.eventKey, payload: r.payload,
      })))
      req.onerror = () => reject(req.error)
    }))
  }

  private async readChapters(projectId: string): Promise<Chapter[]> {
    return openDB().then(db => new Promise<Chapter[]>((resolve, reject) => {
      const txn = db.transaction(STORE_CHAPTERS, 'readonly')
      const store = txn.objectStore(STORE_CHAPTERS)
      const idx = store.index('byProject')
      const req = idx.getAll(IDBKeyRange.only(projectId))
      req.onsuccess = () => {
        const records = req.result as ChapterRecord[]
        const chapters = records
          .sort((a, b) => a.number - b.number)
          .map(r => ({
            number: r.number, title: r.title, taskId: r.taskId, prose: r.prose,
            state: r.state, summary: r.summary, commitId: r.commitId, incompleteReason: r.incompleteReason,
          }))
        resolve(chapters)
      }
      req.onerror = () => reject(req.error)
    }))
  }

  // ─── 写作技能转换 ───────────────────────────────────────────

  private writingSkillToState(imported: WritingSkillImport): WritingSkillState {
    return {
      status: WritingSkillStatus.ACTIVE,
      displayName: imported.qualityCard.name,
      format: imported.format,
      sourceSha256: imported.sourceSha256,
      importedAt: new Date().toISOString(),
      qualityCard: imported.qualityCard,
      errorCode: null,
    }
  }

  // ─── 校验 ──────────────────────────────────────────────────

  private validatePlanWindow(plan: PlanItem[], expectedFirstChapter: number): void {
    if (plan.length < PLAN_WINDOW_MIN || plan.length > PLAN_WINDOW_MAX) throw new StorageError('PLAN_WINDOW_INVALID')
    const chapters = plan.map(p => p.chapter)
    const expected = Array.from({ length: plan.length }, (_, i) => expectedFirstChapter + i)
    if (chapters.join(',') !== expected.join(',')) throw new StorageError('PLAN_SEQUENCE_INVALID')
    if (!plan.every(p => p.title.trim() && p.goal.trim() && p.mustChange.trim())) {
      throw new StorageError('PLAN_ITEM_INVALID')
    }
  }

  // ─── 导出/导入支持 ─────────────────────────────────────────

  async exportProjectData(projectId: string): Promise<ProjectRecord & { chapters: ChapterRecord[]; events: EventRecord[]; completedCommits: PendingCommit[] } | null> {
    const record = await tx<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', s => s.get(projectId))
    if (!record) return null

    const chapters = await openDB().then(db => new Promise<ChapterRecord[]>((resolve, reject) => {
      const txn = db.transaction(STORE_CHAPTERS, 'readonly')
      const idx = txn.objectStore(STORE_CHAPTERS).index('byProject')
      const req = idx.getAll(IDBKeyRange.only(projectId))
      req.onsuccess = () => resolve(req.result as ChapterRecord[])
      req.onerror = () => reject(req.error)
    }))

    const events = await openDB().then(db => new Promise<EventRecord[]>((resolve, reject) => {
      const txn = db.transaction(STORE_EVENTS, 'readonly')
      const idx = txn.objectStore(STORE_EVENTS).index('byProject')
      const req = idx.getAll(IDBKeyRange.only(projectId))
      req.onsuccess = () => resolve(req.result as EventRecord[])
      req.onerror = () => reject(req.error)
    }))

    const allCompleted = await txAll<PendingCommit>(STORE_COMPLETED_COMMITS, 'readonly')
    const completedCommits = allCompleted.filter(c => c.projectId === projectId)

    return { ...record, chapters, events, completedCommits }
  }
}
