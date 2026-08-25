/**
 * 应用状态管理 — React Context + useReducer。
 * 管理：项目列表、当前快照、Provider 配置、生成状态、阅读偏好。
 */

import { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react'
import type { ProjectSnapshot } from '../core/domain'
import type { ProviderSummary } from '../core/provider-contract'
import type { GenerationJob } from '../core/generation-job'
import { JobStage } from '../core/generation-job'
import type { ReaderPreferences } from './theme'

// ─── 生成 UI 状态 ───────────────────────────────────────────

export type GenerationUiState =
  | { type: 'Idle' }
  | { type: 'Running'; projectId: string; chapter: number; stage: JobStage; batchPosition: number; batchTotal: number }
  | { type: 'NeedsAction'; projectId: string; code: string }
  | { type: 'Finished'; projectId: string; message: string }

// ─── 状态 ──────────────────────────────────────────────────

interface AppState {
  projects: ProjectSnapshot[]
  activeProjectId: string | null
  snapshot: ProjectSnapshot | null
  providerConfigured: boolean
  providerSummary: ProviderSummary | null
  generationState: GenerationUiState
  preferences: ReaderPreferences
  message: string | null
}

type Action =
  | { type: 'SET_PROJECTS'; projects: ProjectSnapshot[]; preferredId?: string | null }
  | { type: 'SET_SNAPSHOT'; snapshot: ProjectSnapshot | null }
  | { type: 'SET_PROVIDER'; configured: boolean; summary: ProviderSummary | null }
  | { type: 'SET_GENERATION'; state: GenerationUiState }
  | { type: 'SET_PREFERENCES'; preferences: ReaderPreferences }
  | { type: 'SET_MESSAGE'; message: string | null }

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PROJECTS':
      return {
        ...state,
        projects: action.projects,
        snapshot: action.projects.find(p => p.project.id === (action.preferredId ?? state.activeProjectId)) ?? action.projects[0] ?? null,
        activeProjectId: action.preferredId ?? state.activeProjectId ?? action.projects[0]?.project.id ?? null,
      }
    case 'SET_SNAPSHOT':
      return { ...state, snapshot: action.snapshot, activeProjectId: action.snapshot?.project.id ?? state.activeProjectId }
    case 'SET_PROVIDER':
      return { ...state, providerConfigured: action.configured, providerSummary: action.summary }
    case 'SET_GENERATION':
      return { ...state, generationState: action.state }
    case 'SET_PREFERENCES':
      return { ...state, preferences: action.preferences }
    case 'SET_MESSAGE':
      return { ...state, message: action.message }
    default:
      return state
  }
}

const initialState: AppState = {
  projects: [],
  activeProjectId: null,
  snapshot: null,
  providerConfigured: false,
  providerSummary: null,
  generationState: { type: 'Idle' },
  preferences: { fontSize: 18, lineHeight: 30, theme: 'SYSTEM' },
  message: null,
}

interface StoreContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

// ─── 阅读偏好持久化 ─────────────────────────────────────────

const PREFS_KEY = 'zhijuan-reader-preferences'

export function loadPreferences(): ReaderPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return { ...initialState.preferences, ...JSON.parse(raw) }
  } catch {}
  return initialState.preferences
}

export function savePreferences(prefs: ReaderPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

// ─── 阅读位置持久化 ─────────────────────────────────────────

const POS_KEY = 'zhijuan-reader-positions'

export interface ReaderPosition {
  chapterNumber: number
  scrollOffset: number
}

export function loadReaderPosition(projectId: string): ReaderPosition | null {
  try {
    const raw = localStorage.getItem(`${POS_KEY}.${projectId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

export function saveReaderPosition(projectId: string, position: ReaderPosition): void {
  localStorage.setItem(`${POS_KEY}.${projectId}`, JSON.stringify(position))
}

export function removeReaderPosition(projectId: string): void {
  localStorage.removeItem(`${POS_KEY}.${projectId}`)
}

// ─── 章节状态标签 ───────────────────────────────────────────

export function chapterStateLabel(state: string): string {
  const labels: Record<string, string> = {
    PLANNED: '计划中',
    WRITING: '写作中',
    READABLE_DRAFT: '可读草稿',
    NEEDS_REVIEW: '待检查',
    COMMITTED: '已提交',
    PAUSED: '已暂停',
  }
  return labels[state] ?? state
}

export function jobStageLabel(stage: JobStage): string {
  const labels: Record<JobStage, string> = {
    [JobStage.PREPARE]: '正在准备本章任务…',
    [JobStage.PROSE_REQUEST]: '正在生成正文…',
    [JobStage.PROSE_SAVED]: '正文已保存，准备结算…',
    [JobStage.SETTLEMENT_REQUEST]: '正文已保存，正在结构化结算…',
    [JobStage.VALIDATE]: '正在本地检查连续性…',
    [JobStage.COMMIT]: '正在安全提交本章…',
    [JobStage.DONE]: '本章已完成',
  }
  return labels[stage]
}
