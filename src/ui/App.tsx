/**
 * 墨渡 Web 主应用 — 从 Kotlin ZhijuanS0App 翻译。
 * 四路由：设置 / 书库 / 生成 / 阅读
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProjectSnapshot, WritingSkillImport, WritingSkillState } from '../core/domain'
import { ContentScale, PlotPace, WritingSkillStatus } from '../core/domain'
import { GenerationCoordinator } from '../core/generation-coordinator'
import { runSequentialBatch } from '../core/sequential-batch'
import { RecoveryAuditor, RecoveryAction } from '../core/generation-job'
import { checkConsistency } from '../core/consistency-checker'
import { IdbNovelRepository } from '../data/idb-repository'
import { IdbJobStore } from '../data/idb-job-store'
import { createProvider, OpenAiCompatibleProvider } from '../data/openai-provider'
import { ProjectArchive } from '../data/project-archive'
import { WritingSkillParser } from '../data/writing-skill'
import { getColors, type ReaderPreferences } from './theme'
import { contentScaleDisplayName, plotPaceDisplayName } from '../core/domain'
import { StoreProvider, useStore, loadPreferences, savePreferences, loadReaderPosition, saveReaderPosition, removeReaderPosition, type GenerationUiState } from './store'
import { LibraryPage } from './pages/LibraryPage'
import { CreateProjectSheet, WritingSkillSheet } from './pages/CreateProjectPage'
import { ProviderSettingsPage } from './pages/ProviderSettingsPage'
import { GenerationPage } from './pages/GenerationPage'
import { ReaderPage } from './pages/ReaderPage'
import { BottomSheet, PrimaryButton, PresetRow } from './components'
import { buildRefreshedPlan } from './presets'

type Route = 'CONNECT_SETTINGS' | 'LIBRARY' | 'GENERATION' | 'READER'

function AppContent() {
  const { state, dispatch } = useStore()
  const [route, setRoute] = useState<Route>('LIBRARY')
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showPlanRefresh, setShowPlanRefresh] = useState(false)
  const [generationBusy, setGenerationBusy] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [recoveryActions, setRecoveryActions] = useState<Record<string, RecoveryAction>>({})
  const [writingSkillProjectId, setWritingSkillProjectId] = useState<string | null>(null)
  const [writingSkillCandidate, setWritingSkillCandidate] = useState<WritingSkillImport | null>(null)
  const [writingSkillError, setWritingSkillError] = useState<string | null>(null)
  const [createWritingSkillCandidate, setCreateWritingSkillCandidate] = useState<WritingSkillImport | null>(null)
  const [contentScaleProjectId, setContentScaleProjectId] = useState<string | null>(null)
  const [plotPaceProjectId, setPlotPaceProjectId] = useState<string | null>(null)
  const [showConsistency, setShowConsistency] = useState(false)

  const repositoryRef = useRef<IdbNovelRepository | null>(null)
  const providerRef = useRef<OpenAiCompatibleProvider | null>(null)
  const coordinatorRef = useRef<GenerationCoordinator | null>(null)
  const archiveRef = useRef<ProjectArchive | null>(null)
  const jobStoreRef = useRef<IdbJobStore | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const skillInputRef = useRef<HTMLInputElement>(null)
  const pendingSkillTargetRef = useRef<string | null>(null)

  // 初始化
  useEffect(() => {
    (async () => {
      const repo = new IdbNovelRepository()
      const provider = createProvider()
      const jobStore = new IdbJobStore()
      const archive = new ProjectArchive(repo)
      repositoryRef.current = repo
      providerRef.current = provider
      jobStoreRef.current = jobStore
      archiveRef.current = archive

      await repo.recoverPendingCommits()
      const projects = await repo.listProjects()
      dispatch({ type: 'SET_PROJECTS', projects })
      const summary = provider.connectionSummary()
      dispatch({ type: 'SET_PROVIDER', configured: summary != null, summary })
      dispatch({ type: 'SET_PREFERENCES', preferences: loadPreferences() })
      if (!summary) setRoute('CONNECT_SETTINGS')
    })()
  }, [])

  // 主题应用
  useEffect(() => {
    const colors = getColors(state.preferences.theme)
    const root = document.documentElement
    Object.entries(colorsToCssVars(colors)).forEach(([k, v]) => root.style.setProperty(k, v))
  }, [state.preferences.theme])

  const refreshProjects = useCallback(async (preferredId?: string | null) => {
    const repo = repositoryRef.current
    if (!repo) return
    const projects = await repo.listProjects()
    dispatch({ type: 'SET_PROJECTS', projects, preferredId })
  }, [])

  const showMessage = useCallback((msg: string) => {
    dispatch({ type: 'SET_MESSAGE', message: msg })
    setTimeout(() => dispatch({ type: 'SET_MESSAGE', message: null }), 3000)
  }, [])

  const startGeneration = useCallback(async (projectId: string, chapterCount: number) => {
    const coordinator = coordinatorRef.current
    const provider = providerRef.current
    const repo = repositoryRef.current
    if (!coordinator || !provider || !repo) return

    if (generationBusy) return
    setGenerationBusy(true)
    dispatch({ type: 'SET_GENERATION', state: { type: 'Running', projectId, chapter: 0, stage: 'PREPARE' as any, batchPosition: 1, batchTotal: chapterCount } })

    try {
      // 锁定 provider profile
      const summary = provider.connectionSummary()
      if (!summary) { showMessage('请先添加并验证一个 API 配置'); return }
      provider.lockProfile(summary.providerId)

      const batch = await runSequentialBatch(
        chapterCount,
        async () => coordinator.generateNextChapter(projectId),
      )
      await refreshProjects(projectId)
      const result = batch.terminal
      switch (result.type) {
        case 'Committed':
          showMessage(batch.completed === 1 ? '正文已保存，结算已幂等提交' : `已顺序完成 ${batch.completed} 章；每章正文与结算均独立提交`)
          break
        case 'ReadableDraft':
          showMessage('正文已保存，可阅读；结算待处理')
          break
        case 'IncompleteDraft':
          showMessage(incompleteDraftMessage(result.reason))
          break
        case 'Rejected':
          showMessage(`生成未完成：${result.reason}`)
          break
      }
    } catch (e) {
      showMessage(`生成失败：${(e as Error).message}`)
    } finally {
      provider.unlockProfile()
      setGenerationBusy(false)
      dispatch({ type: 'SET_GENERATION', state: { type: 'Idle' } })
    }
  }, [generationBusy, refreshProjects, showMessage])

  // 初始化 coordinator
  useEffect(() => {
    if (repositoryRef.current && providerRef.current && !coordinatorRef.current) {
      coordinatorRef.current = new GenerationCoordinator(repositoryRef.current, providerRef.current)
    }
  })

  const handleCreateProject = async (draft: { project: any; plan: any[]; writingSkill?: WritingSkillImport }) => {
    const repo = repositoryRef.current
    if (!repo) return
    try {
      await repo.createProject(draft.project, draft.plan, draft.writingSkill)
      await refreshProjects(draft.project.id)
      setShowCreateProject(false)
      setCreateWritingSkillCandidate(null)
      showMessage('小说已保存到本机')
    } catch (e) {
      showMessage('创建失败：请检查五项文字内容后重试')
    }
  }

  const handleExport = async (projectId: string) => {
    const archive = archiveRef.current
    if (!archive) return
    setArchiveBusy(true)
    try {
      const { blob, result } = await archive.export(projectId)
      const snapshot = await repositoryRef.current!.loadProject(projectId)
      const fileName = `${snapshot!.project.title.replace(/[\\/:*?"<>|]/g, '_').trim() || '墨渡项目'}.modu.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName; a.click()
      URL.revokeObjectURL(url)
      showMessage('备份已导出')
    } catch {
      showMessage('导出失败，项目仍安全保留在本机')
    } finally {
      setArchiveBusy(false)
    }
  }

  const handleExportWholeBook = async (projectId: string, format: 'txt' | 'md') => {
    const archive = archiveRef.current
    if (!archive) return
    setArchiveBusy(true)
    try {
      const blob = await archive.exportWholeBook(projectId, format)
      const snapshot = await repositoryRef.current!.loadProject(projectId)
      const safeName = snapshot!.project.title.replace(/[\\/:*?"<>|]/g, '_').trim() || '墨渡项目'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${safeName}.${format}`; a.click()
      URL.revokeObjectURL(url)
      showMessage(`整书已导出为 ${format.toUpperCase()}`)
    } catch {
      showMessage('整书导出失败，项目仍安全保留在本机')
    } finally {
      setArchiveBusy(false)
    }
  }

  const handleImport = async (file: File) => {
    const archive = archiveRef.current
    if (!archive) return
    setArchiveBusy(true)
    try {
      const result = await archive.import(file)
      await refreshProjects(result.projectId)
      showMessage('备份已安全导入，可继续阅读和生成')
    } catch {
      showMessage('导入失败：备份无效或不安全，未写入项目')
    } finally {
      setArchiveBusy(false)
    }
  }

  const handleDelete = async (projectId: string) => {
    const repo = repositoryRef.current
    if (!repo) return
    try {
      await repo.discardProject(projectId)
      removeReaderPosition(projectId)
      setRecoveryActions(prev => { const next = { ...prev }; delete next[projectId]; return next })
      await refreshProjects(null)
      showMessage('项目已从本机删除；API 配置与其他书未改变')
    } catch {
      showMessage('删除失败：本地文件未完整移除，请重试')
    }
  }

  const handleWritingSkillFile = async (file: File, target: string) => {
    try {
      const text = await file.text()
      const parser = new WritingSkillParser()
      const imported = await parser.parse(file.name, text)
      setWritingSkillError(null)
      if (target === '__create_project_writing_skill__') {
        setCreateWritingSkillCandidate(imported)
      } else {
        setWritingSkillProjectId(target)
        setWritingSkillCandidate(imported)
      }
    } catch (e) {
      setWritingSkillError(writingSkillErrorMessage((e as Error).message))
    }
  }

  const handleSaveContentScale = async (scale: ContentScale) => {
    if (!contentScaleProjectId) return
    const repo = repositoryRef.current!
    try {
      await repo.saveContentScale(contentScaleProjectId, scale)
      await refreshProjects(contentScaleProjectId)
      setContentScaleProjectId(null)
      showMessage(`叙事尺度已更新为${contentScaleDisplayName(scale)}`)
    } catch {
      showMessage('保存失败：生成或安全提交期间不能修改叙事尺度')
    }
  }

  const handleSavePlotPace = async (pace: PlotPace) => {
    if (!plotPaceProjectId) return
    const repo = repositoryRef.current!
    try {
      await repo.savePlotPace(plotPaceProjectId, pace)
      await refreshProjects(plotPaceProjectId)
      setPlotPaceProjectId(null)
      showMessage(`剧情节奏已更新为${plotPaceDisplayName(pace)}`)
    } catch {
      showMessage('保存失败：生成或安全提交期间不能修改剧情节奏')
    }
  }

  const handleRefreshPlan = async () => {
    const repo = repositoryRef.current!
    if (!state.snapshot) return
    try {
      const plan = buildRefreshedPlan(state.snapshot)
      await repo.replacePlan(state.snapshot.project.id, state.snapshot.storyState.revision, plan)
      await refreshProjects(state.snapshot.project.id)
      setShowPlanRefresh(false)
      showMessage('后续 8 章文字计划已确认')
    } catch {
      showMessage('计划刷新失败：项目状态已变化，请重新打开')
    }
  }

  const isBusy = generationBusy || state.generationState.type === 'Running'

  return (
    <div className="app-container">
      {(route === 'LIBRARY' || route === 'CONNECT_SETTINGS') && (
        <nav className="bottom-nav">
          <button className={`nav-item ${route === 'LIBRARY' ? 'active' : ''}`} onClick={() => setRoute('LIBRARY')}>
            <span className="nav-icon">📖</span>
            <span className="nav-label">书库</span>
          </button>
          <button className={`nav-item ${route === 'CONNECT_SETTINGS' ? 'active' : ''}`} onClick={() => setRoute('CONNECT_SETTINGS')}>
            <span className="nav-icon">⚙</span>
            <span className="nav-label">设置</span>
          </button>
        </nav>
      )}

      <div className="page-container">
        {route === 'CONNECT_SETTINGS' && providerRef.current && (
          <ProviderSettingsPage
            provider={providerRef.current}
            onSaved={() => {
              const summary = providerRef.current!.connectionSummary()
              dispatch({ type: 'SET_PROVIDER', configured: summary != null, summary })
            }}
            profilesLocked={isBusy}
            preferences={state.preferences}
            onPreferencesChange={(prefs) => { dispatch({ type: 'SET_PREFERENCES', preferences: prefs }); savePreferences(prefs) }}
          />
        )}

        {route === 'LIBRARY' && (
          <LibraryPage
            projects={state.projects}
            activeProjectId={state.activeProjectId}
            runningProjectId={state.generationState.type === 'Running' ? state.generationState.projectId : null}
            recoveryActions={recoveryActions}
            archiveBusy={archiveBusy}
            onCreate={() => { setCreateWritingSkillCandidate(null); setWritingSkillError(null); setShowCreateProject(true) }}
            onSelect={async (id) => { const snap = await repositoryRef.current!.loadProject(id); dispatch({ type: 'SET_SNAPSHOT', snapshot: snap }) }}
            onGenerate={async (id) => {
              const snap = await repositoryRef.current!.loadProject(id)
              dispatch({ type: 'SET_SNAPSHOT', snapshot: snap })
              if (state.providerConfigured) setRoute('GENERATION')
              else { setRoute('CONNECT_SETTINGS'); showMessage('请先测试并保存 Provider') }
            }}
            onRead={async (id) => {
              const snap = await repositoryRef.current!.loadProject(id)
              dispatch({ type: 'SET_SNAPSHOT', snapshot: snap })
              setRoute('READER')
            }}
            onExport={handleExport}
            onExportWholeBook={handleExportWholeBook}
            onImport={() => importInputRef.current?.click()}
            onDelete={handleDelete}
            onManageWritingSkill={(id) => { setWritingSkillProjectId(id); setWritingSkillCandidate(null); setWritingSkillError(null) }}
            onManageContentScale={(id) => setContentScaleProjectId(id)}
            onManagePlotPace={(id) => setPlotPaceProjectId(id)}
          />
        )}

        {route === 'GENERATION' && (
          <GenerationPage
            snapshot={state.snapshot}
            isBusy={isBusy}
            serviceStatus={state.generationState}
            recoveryAction={state.snapshot ? (recoveryActions[state.snapshot.project.id] ?? RecoveryAction.NONE) : RecoveryAction.NONE}
            providerSummary={state.providerSummary}
            onBack={() => setRoute('LIBRARY')}
            onGenerate={(count) => state.snapshot && startGeneration(state.snapshot.project.id, count)}
            onRetrySettlement={() => {
              if (!state.snapshot || !coordinatorRef.current) return
              coordinatorRef.current.retrySettlement(state.snapshot.project.id)
            }}
            onCancel={() => {
              if (providerRef.current) providerRef.current.cancel('cancel')
              setGenerationBusy(false)
            }}
            onRefreshPlan={() => setShowPlanRefresh(true)}
            onRead={() => setRoute('READER')}
          />
        )}

        {route === 'READER' && (
          <ReaderPage
            snapshot={state.snapshot}
            preferences={state.preferences}
            initialPosition={state.snapshot ? loadReaderPosition(state.snapshot.project.id) : null}
            onPositionChange={(pos) => state.snapshot && saveReaderPosition(state.snapshot.project.id, pos)}
            onBack={() => setRoute('LIBRARY')}
            onReturnToCreation={() => setRoute('GENERATION')}
            generationInProgress={state.generationState.type === 'Running'}
            onOpenGeneration={() => setRoute('GENERATION')}
            onContinueWriting={(count) => {
              if (!state.snapshot) return
              if (state.providerConfigured) { setRoute('GENERATION'); startGeneration(state.snapshot.project.id, count) }
              else { setRoute('CONNECT_SETTINGS'); showMessage('请先添加并验证一个 API 配置') }
            }}
            onCheckConsistency={() => setShowConsistency(true)}
          />
        )}
      </div>

      {state.message && <div className="toast">{state.message}</div>}

      {showCreateProject && (
        <CreateProjectSheet
          onDismiss={() => setShowCreateProject(false)}
          onConfirm={handleCreateProject}
          writingSkill={createWritingSkillCandidate}
          writingSkillError={writingSkillError}
          onChooseWritingSkill={() => { pendingSkillTargetRef.current = '__create_project_writing_skill__'; skillInputRef.current?.click() }}
          onUpdateWritingSkill={setCreateWritingSkillCandidate}
          onRemoveWritingSkill={() => { setCreateWritingSkillCandidate(null); setWritingSkillError(null) }}
        />
      )}

      {writingSkillProjectId && state.snapshot && (
        <WritingSkillSheet
          projectTitle={state.snapshot.project.title}
          current={state.snapshot.writingSkill}
          candidate={writingSkillCandidate}
          error={writingSkillError}
          onDismiss={() => { setWritingSkillProjectId(null); setWritingSkillCandidate(null); setWritingSkillError(null) }}
          onChoose={() => { pendingSkillTargetRef.current = writingSkillProjectId; skillInputRef.current?.click() }}
          onApply={async (imported) => {
            try {
              await repositoryRef.current!.saveWritingSkill(writingSkillProjectId, imported)
              await refreshProjects(writingSkillProjectId)
              setWritingSkillProjectId(null); setWritingSkillCandidate(null)
              showMessage('创作质量卡已应用；后续正文请求会携带其哈希')
            } catch { showMessage('应用失败：生成或安全提交期间不能替换质量卡') }
          }}
          onRemove={async () => {
            try {
              await repositoryRef.current!.removeWritingSkill(writingSkillProjectId)
              await refreshProjects(writingSkillProjectId)
              setWritingSkillProjectId(null); setWritingSkillCandidate(null)
              showMessage('创作 Skill 已移除；后续使用墨渡默认质量卡')
            } catch { showMessage('移除失败：生成或安全提交期间不能修改质量卡') }
          }}
          onDiscardCandidate={() => { setWritingSkillCandidate(null); setWritingSkillError(null) }}
        />
      )}

      {contentScaleProjectId && state.snapshot && (
        <BottomSheet title="叙事尺度" onClose={() => setContentScaleProjectId(null)}>
          <p className="muted-text">{state.snapshot.project.title}</p>
          <PresetRow label="描写层级" options={[ContentScale.QING_XU, ContentScale.AN_YONG, ContentScale.CHEN_JIN].map(contentScaleDisplayName)} selected={o => o === contentScaleDisplayName(state.snapshot!.project.contentScale)} onSelect={label => {
            const scale = [ContentScale.QING_XU, ContentScale.AN_YONG, ContentScale.CHEN_JIN].find(s => contentScaleDisplayName(s) === label)!
            handleSaveContentScale(scale)
          }} />
        </BottomSheet>
      )}

      {plotPaceProjectId && state.snapshot && (
        <BottomSheet title="剧情节奏" onClose={() => setPlotPaceProjectId(null)}>
          <p className="muted-text">{state.snapshot.project.title}</p>
          <PresetRow label="推进速度" options={[PlotPace.EXPANSIVE, PlotPace.BALANCED, PlotPace.TIGHT].map(plotPaceDisplayName)} selected={o => o === plotPaceDisplayName(state.snapshot!.project.plotPace)} onSelect={label => {
            const pace = [PlotPace.EXPANSIVE, PlotPace.BALANCED, PlotPace.TIGHT].find(p => plotPaceDisplayName(p) === label)!
            handleSavePlotPace(pace)
          }} />
        </BottomSheet>
      )}

      {showPlanRefresh && state.snapshot && (
        <BottomSheet title="准备后续章节" onClose={() => setShowPlanRefresh(false)}>
          <p>墨渡会在本机准备接下来的章节方向，不展示内部规划，不调用模型，也不会自动开始写作。</p>
          <PrimaryButton label="确认准备后续章节" onClick={handleRefreshPlan} />
        </BottomSheet>
      )}

      {showConsistency && state.snapshot && (() => {
        const report = checkConsistency(state.snapshot)
        return (
          <BottomSheet title="一致性检查" onClose={() => setShowConsistency(false)}>
            <p className="muted-text">已检查 {report.checkedChapters} 个已完成章节，{report.issues.length === 0 ? '未发现问题' : `发现 ${report.issues.length} 项待关注`}。</p>
            {report.issues.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                {report.issues.map((issue, i) => (
                  <div key={i} style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: issue.severity === 'error' ? 'rgba(176,23,23,0.08)' : 'rgba(168,79,8,0.08)',
                    border: `1px solid ${issue.severity === 'error' ? 'rgba(176,23,23,0.2)' : 'rgba(168,79,8,0.2)'}`,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: issue.severity === 'error' ? '#B01717' : '#A84F08' }}>
                      {issue.severity === 'error' ? '错误' : '警告'}
                      {issue.chapter != null ? ` · 第 ${issue.chapter} 章` : ''}
                    </span>
                    <p style={{ fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>{issue.message}</p>
                  </div>
                ))}
              </div>
            )}
            {report.passed && report.issues.length > 0 && (
              <p className="muted-text" style={{ marginTop: 12 }}>仅有警告级别提示，未影响章节提交。</p>
            )}
            <PrimaryButton label="完成" onClick={() => setShowConsistency(false)} />
          </BottomSheet>
        )
      })()}

      {/* 隐藏文件输入 */}
      <input ref={importInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }} />
      <input ref={skillInputRef} type="file" accept=".md,.json,text/markdown,text/plain,application/json" style={{ display: 'none' }} onChange={e => {
        const f = e.target.files?.[0]
        const target = pendingSkillTargetRef.current
        if (f && target) handleWritingSkillFile(f, target)
        pendingSkillTargetRef.current = null
        e.target.value = ''
      }} />
    </div>
  )
}

function incompleteDraftMessage(code: string): string {
  if (code.includes('TRUNCATED_LENGTH') || code.includes('LIMIT_EXCEEDED'))
    return '正文达到输出上限，当前片段已安全保留但不会结算。可明确重新生成本章。'
  if (code.includes('CONTENT_FILTERED'))
    return 'Provider 因内容规则停止输出，当前片段不会结算。请使用符合 Provider 规则的表达后重新生成。'
  if (code.includes('RESOURCE_INTERRUPTED'))
    return 'Provider 资源中断，当前片段已安全保留但不会结算。可稍后重新生成本章。'
  return '正文没有确认自然结束，当前片段已安全保留但不会结算。'
}

function writingSkillErrorMessage(code: string): string {
  if (code.includes('FORMAT_UNSUPPORTED')) return '只支持单个 .md 或 .json 文件'
  if (code.includes('UTF8_REQUIRED') || code.includes('BINARY_REJECTED')) return '文件必须是有效 UTF-8 纯文本'
  if (code.includes('SOURCE_TOO_LARGE')) return '文件超过 256 KiB，请先删减'
  if (code.includes('TOO_MANY_RULES') || code.includes('CARD_TOO_LONG')) return '质量卡最多 8 条、合计 1600 字符，请先删减'
  if (code.includes('JSON_INVALID')) return 'JSON 文件格式无效，请检查括号和引号'
  if (code.includes('UNSAFE') || code.includes('REFERENCE') || code.includes('HTML')) return '文件包含工具、文件、网络、外部引用或指令覆盖内容，未导入'
  if (code.includes('NO_SUPPORTED_RULES')) return '没有在受支持标题下找到可用列表规则'
  return '无法读取该 Skill；未保存任何内容'
}

import { colorsToCssVars } from './theme'

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  )
}
