/**
 * 织卷核心领域模型 — 从 Kotlin :core 模块直接翻译。
 * 无任何浏览器/平台依赖，纯逻辑层。
 */

import type { ProviderSummary, ProviderSetupInput, ConnectionTestResult, CancelResult } from './provider-contract'

// ─── 章节状态 ───────────────────────────────────────────────

export enum ChapterState {
  PLANNED = 'PLANNED',
  WRITING = 'WRITING',
  READABLE_DRAFT = 'READABLE_DRAFT',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  COMMITTED = 'COMMITTED',
  PAUSED = 'PAUSED',
}

// ─── 叙事尺度 ───────────────────────────────────────────────

export enum ContentScale {
  QING_XU = 'QING_XU', // 清叙
  AN_YONG = 'AN_YONG', // 暗涌
  CHEN_JIN = 'CHEN_JIN', // 沉浸
}

export function contentScaleDisplayName(scale: ContentScale): string {
  switch (scale) {
    case ContentScale.QING_XU: return '清叙'
    case ContentScale.AN_YONG: return '暗涌'
    case ContentScale.CHEN_JIN: return '沉浸'
  }
}

// ─── 剧情节奏 ───────────────────────────────────────────────

export enum PlotPace {
  EXPANSIVE = 'EXPANSIVE', // 舒展
  BALANCED = 'BALANCED', // 均衡
  TIGHT = 'TIGHT', // 紧凑
}

export function plotPaceDisplayName(pace: PlotPace): string {
  switch (pace) {
    case PlotPace.EXPANSIVE: return '舒展'
    case PlotPace.BALANCED: return '均衡'
    case PlotPace.TIGHT: return '紧凑'
  }
}

// ─── 项目 ────────────────────────────────────────────────────

export interface Project {
  id: string
  title: string
  genre: string
  protagonist: string
  tone: string
  premise: string
  createdAt: string
  contentScale: ContentScale
  plotPace: PlotPace
}

export function newProject(partial: Partial<Project> & Pick<Project, 'id' | 'title' | 'genre' | 'protagonist' | 'tone' | 'premise'>): Project {
  return {
    createdAt: new Date().toISOString(),
    contentScale: ContentScale.QING_XU,
    plotPace: PlotPace.BALANCED,
    ...partial,
  }
}

// ─── 章节计划 ───────────────────────────────────────────────

export interface PlanItem {
  chapter: number
  title: string
  goal: string
  entryState: string
  mustChange: string
  exitHook: string
  involvedEntityIds: string[]
  mustNotRepeatEventKeys: string[]
}

// ─── 故事状态 ───────────────────────────────────────────────

export interface StoryState {
  revision: number
  nextChapter: number
  committedChapters: number[]
  recentEventKeys: string[]
}

export function initialStoryState(): StoryState {
  return { revision: 0, nextChapter: 1, committedChapters: [], recentEventKeys: [] }
}

// ─── 章节 ────────────────────────────────────────────────────

export interface Chapter {
  number: number
  title: string
  taskId: string
  prose: string
  state: ChapterState
  summary: string | null
  commitId: string | null
  incompleteReason: string | null
}

// ─── 写作质量卡 ──────────────────────────────────────────────

export enum WritingSkillFormat { MARKDOWN = 'MARKDOWN', JSON = 'JSON' }
export enum WritingSkillStatus { NONE = 'NONE', ACTIVE = 'ACTIVE', DISABLED_CORRUPT = 'DISABLED_CORRUPT' }

export interface WritingQualityCard {
  name: string
  version: number
  rules: string[]
  avoid: string[]
  preferredTerms: string[]
  sha256: string
}

export interface WritingSkillImport {
  sourceFileName: string
  format: WritingSkillFormat
  sourceText: string
  sourceSha256: string
  qualityCard: WritingQualityCard
}

export interface WritingSkillState {
  status: WritingSkillStatus
  displayName: string | null
  format: WritingSkillFormat | null
  sourceSha256: string | null
  importedAt: string | null
  qualityCard: WritingQualityCard | null
  errorCode: string | null
}

export function emptyWritingSkillState(): WritingSkillState {
  return {
    status: WritingSkillStatus.NONE,
    displayName: null,
    format: null,
    sourceSha256: null,
    importedAt: null,
    qualityCard: null,
    errorCode: null,
  }
}

// ─── 项目快照 ───────────────────────────────────────────────

export interface ProjectSnapshot {
  project: Project
  storyState: StoryState
  plan: PlanItem[]
  chapters: Chapter[]
  writingSkill: WritingSkillState
}

// ─── 章节任务（生成输入） ────────────────────────────────────

export interface ChapterTask {
  taskId: string
  projectId: string
  chapter: number
  baseRevision: number
  title: string
  goal: string
  previousTail: string
  povCharacterId: string
  allowedEntityIds: string[]
  hardFacts: string[]
  recentSummaries: string[]
  openThreads: string[]
  mustDo: string[]
  mustNotDo: string[]
  recentEventKeys: string[]
  qualityCardId: string
  writingQualityCard: WritingQualityCard | null
  contentScale: ContentScale
  settlementRepairHint: string | null
  plotPace: PlotPace
}

// ─── 结算（生成输出） ────────────────────────────────────────

export interface SettlementEvent {
  eventId: string
  eventKey: string
  description: string
  participants: string[]
  stateTargets: string[]
}

export interface Settlement {
  taskId: string
  chapter: number
  baseRevision: number
  summary: string
  eventKey: string
  eventDescription: string
  events: SettlementEvent[]
}

// ─── 事件日志 ───────────────────────────────────────────────

export interface StoryEvent {
  eventId: string
  commitId: string
  chapter: number
  eventKey: string
  payload: string
}

// ─── 幂等提交 ───────────────────────────────────────────────

export interface PendingCommit {
  commitId: string
  projectId: string
  chapter: number
  baseRevision: number
  targetRevision: number
  newState: StoryState
  newPlan: PlanItem[]
  events: StoryEvent[]
  chapterMeta: Chapter
}

// ─── 生成结果 ───────────────────────────────────────────────

export type GenerationResult =
  | { type: 'Committed'; chapter: Chapter; proseCalls: number; settlementCalls: number }
  | { type: 'ReadableDraft'; chapter: Chapter; reason: string }
  | { type: 'IncompleteDraft'; chapter: Chapter; reason: string }
  | { type: 'Rejected'; reason: string }

// ─── 仓储接口 ───────────────────────────────────────────────

export interface NovelRepository {
  createProject(project: Project, plan: PlanItem[], writingSkill?: WritingSkillImport): Promise<ProjectSnapshot>
  listProjects(): Promise<ProjectSnapshot[]>
  loadProject(projectId: string): Promise<ProjectSnapshot | null>
  replacePlan(projectId: string, expectedRevision: number, plan: PlanItem[]): Promise<ProjectSnapshot>
  deleteProject(projectId: string): Promise<boolean>
  discardProject(projectId: string): Promise<boolean>
  saveWritingSkill(projectId: string, writingSkill: WritingSkillImport): Promise<ProjectSnapshot>
  removeWritingSkill(projectId: string): Promise<ProjectSnapshot>
  saveContentScale(projectId: string, contentScale: ContentScale): Promise<ProjectSnapshot>
  savePlotPace(projectId: string, plotPace: PlotPace): Promise<ProjectSnapshot>
  saveReadableDraft(projectId: string, task: ChapterTask, prose: string): Promise<Chapter>
  saveIncompleteDraft(projectId: string, task: ChapterTask, prose: string, reason: string): Promise<Chapter>
  writePendingCommit(commit: PendingCommit): Promise<void>
  applyPendingCommit(commitId: string): Promise<void>
  recoverPendingCommits(): Promise<string[]>
}

// ─── 文本生成 Provider 接口 ─────────────────────────────────

export interface TextGenerationProvider {
  streamProse(task: ChapterTask, onChunk: (chunk: string) => void): Promise<string>
  completeSettlement(task: ChapterTask, prose: string): Promise<Settlement>
  connectionSummary(): ProviderSummary | null
  connectionProfiles(): ProviderSummary[]
  selectConnectionProfile(profileId: string): { ok: true; value: ProviderSummary } | { ok: false; error: string }
  deleteConnectionProfile(profileId: string): { ok: true } | { ok: false; error: string }
  testAndSaveConnection(input: ProviderSetupInput): Promise<ConnectionTestResult>
  cancel(requestId: string): CancelResult
}
