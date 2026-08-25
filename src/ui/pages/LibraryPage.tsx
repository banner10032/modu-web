/**
 * 书库页面 — 从 Kotlin S5LibraryScreen 翻译。
 */

import { useState } from 'react'
import type { ProjectSnapshot } from '../../core/domain'
import type { RecoveryAction } from '../../core/generation-job'
import { chapterStateLabel } from '../store'
import { BrandBar, SectionHeader, PrimaryButton, SecondaryButton, BookCover, AlertDialog } from '../components'

function editorialProgressLabel(snapshot: ProjectSnapshot): string {
  const characters = snapshot.chapters.reduce((sum, c) => sum + c.prose.length, 0)
  const count = characters >= 10000
    ? `${(characters / 10000).toFixed(1)} 万字`
    : `${characters} 字`
  return `已完成 ${snapshot.storyState.committedChapters.length} 章 · ${count}`
}

function recoveryLabel(action: RecoveryAction): string {
  const labels: Record<RecoveryAction, string> = {
    NONE: '无',
    RETRY_PROSE: '重试正文',
    RETRY_SETTLEMENT: '只重试结算',
    CONFIRM_RESEND: '确认是否重发',
    REVIEW_DRAFT: '检查已保存草稿',
  }
  return labels[action]
}

export function LibraryPage({
  projects, activeProjectId, runningProjectId, recoveryActions, archiveBusy,
  onCreate, onSelect, onGenerate, onRead, onExport, onImport, onDelete,
  onManageWritingSkill, onManageContentScale, onManagePlotPace,
}: {
  projects: ProjectSnapshot[]
  activeProjectId: string | null
  runningProjectId: string | null
  recoveryActions: Record<string, RecoveryAction>
  archiveBusy: boolean
  onCreate: () => void
  onSelect: (projectId: string) => void
  onGenerate: (projectId: string) => void
  onRead: (projectId: string) => void
  onExport: ((projectId: string) => void) | null
  onImport: (() => void) | null
  onDelete: (projectId: string) => void
  onManageWritingSkill: (projectId: string) => void
  onManageContentScale: (projectId: string) => void
  onManagePlotPace: (projectId: string) => void
}) {
  const [deleteCandidate, setDeleteCandidate] = useState<ProjectSnapshot | null>(null)
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null)
  const featured = projects.find(p => p.project.id === activeProjectId) ?? projects[0]

  return (
    <div className="page library-page">
      <BrandBar title="书库" actionIcon="＋" actionDescription="新建小说" onAction={onCreate} />
      <hr className="divider" />

      {projects.length === 0 ? (
        <>
          <SectionHeader title="还没有本地作品" />
          <p className="muted-text">从书名、题材、主角、基调和核心设定开始，确认后安全保存到本机。</p>
          <PrimaryButton label="创建小说" onClick={onCreate} icon="📚" />
          {onImport && (
            <SecondaryButton label={archiveBusy ? '正在处理备份…' : '导入备份'} onClick={onImport} disabled={archiveBusy} />
          )}
        </>
      ) : (
        <>
          <SectionHeader title="最近创作" meta={`${projects.length} 本书`} />
          {featured && <FeaturedProject
            snapshot={featured}
            recoveryAction={recoveryActions[featured.project.id] ?? 'NONE'}
            onGenerate={() => onGenerate(featured.project.id)}
            onRead={() => onRead(featured.project.id)}
          />}
          <hr className="divider" />
          <SectionHeader title="全部作品" meta={`${projects.length} 本书`} />
          {projects.map(project => {
            const selected = project.project.id === featured?.project.id
            const recovery = recoveryActions[project.project.id] ?? 'NONE'
            return (
              <div
                key={project.project.id}
                className={`project-row ${selected ? 'selected' : ''}`}
                onClick={() => onSelect(project.project.id)}
              >
                {selected && <span className="project-row-indicator" />}
                <BookCover title={project.project.title} compact />
                <div className="project-row-info">
                  <div className="project-row-title">
                    <span className="project-title-text">{project.project.title}</span>
                    {selected && <span className="project-current-badge">当前</span>}
                  </div>
                  <span className="project-row-meta">{project.project.genre} · {project.project.protagonist}</span>
                  {project.chapters[project.chapters.length - 1] && (
                    <span className="project-row-meta">第 {project.chapters[project.chapters.length - 1].number} 章</span>
                  )}
                  <span className="project-row-meta">{editorialProgressLabel(project)}</span>
                  {recovery !== 'NONE' && (
                    <span className="project-row-recovery">需要恢复：{recoveryLabel(recovery)}</span>
                  )}
                </div>
                <div className="project-row-menu">
                  <button
                    className="menu-trigger"
                    onClick={(e) => { e.stopPropagation(); setExpandedMenu(expandedMenu === project.project.id ? null : project.project.id) }}
                  >
                    ⋮
                  </button>
                  {expandedMenu === project.project.id && (
                    <div className="menu-popup" onClick={e => e.stopPropagation()}>
                      <button className="menu-item" onClick={() => { setExpandedMenu(null); onGenerate(project.project.id) }}>
                        {project.chapters.length === 0 ? '开始创作' : '继续创作'}
                      </button>
                      {project.chapters.length > 0 && (
                        <button className="menu-item" onClick={() => { setExpandedMenu(null); onRead(project.project.id) }}>
                          继续阅读
                        </button>
                      )}
                      <button className="menu-item" onClick={() => { setExpandedMenu(null); onManageWritingSkill(project.project.id) }}>
                        创作 Skill
                      </button>
                      <button className="menu-item" onClick={() => { setExpandedMenu(null); onManageContentScale(project.project.id) }}>
                        叙事尺度
                      </button>
                      <button className="menu-item" onClick={() => { setExpandedMenu(null); onManagePlotPace(project.project.id) }}>
                        剧情节奏
                      </button>
                      {onExport && (
                        <button className="menu-item" disabled={archiveBusy} onClick={() => { setExpandedMenu(null); onExport(project.project.id) }}>
                          导出备份
                        </button>
                      )}
                      <hr className="menu-divider" />
                      <button className="menu-item menu-item-danger" onClick={() => { setExpandedMenu(null); setDeleteCandidate(project) }}>
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div className="library-bottom-actions">
            <PrimaryButton label="新建小说" onClick={onCreate} />
            {onImport && (
              <SecondaryButton label={archiveBusy ? '处理中…' : '导入备份'} onClick={onImport} disabled={archiveBusy} />
            )}
          </div>
        </>
      )}
      <p className="muted-text">备份不包含 API Key、活动请求或诊断正文。</p>

      {deleteCandidate && (
        <AlertDialog
          title={`删除《${deleteCandidate.project.title}》？`}
          message="将删除这本书的全部本机项目文件。不会发送 API 请求；API 配置和其他书不受影响。此操作无法撤销。"
          confirmLabel="确认删除"
          cancelLabel="取消"
          onConfirm={() => { onDelete(deleteCandidate.project.id); setDeleteCandidate(null) }}
          onCancel={() => setDeleteCandidate(null)}
          danger
        />
      )}
    </div>
  )
}

function FeaturedProject({ snapshot, recoveryAction, onGenerate, onRead }: {
  snapshot: ProjectSnapshot
  recoveryAction: RecoveryAction
  onGenerate: () => void
  onRead: () => void
}) {
  const latest = snapshot.chapters[snapshot.chapters.length - 1]
  const next = snapshot.plan[0]
  return (
    <div className="featured-project">
      <div className="featured-project-top">
        <BookCover title={snapshot.project.title} />
        <div className="featured-project-info">
          <h3 className="featured-project-title">{snapshot.project.title}</h3>
          <span className="muted-text">{snapshot.project.genre} · 长篇</span>
          <hr className="featured-divider" />
          <span className="featured-chapter">
            {latest ? `第 ${latest.number} 章` : next ? `第 ${next.chapter} 章` : '尚无章节'}
          </span>
          <hr className="featured-divider" />
          <span className="muted-text">{editorialProgressLabel(snapshot)}</span>
          <span className="muted-text">{latest ? '可继续阅读或续写后续章节' : '可开始生成第一章'}</span>
          {recoveryAction !== 'NONE' && (
            <span className="project-row-recovery">需要恢复：{recoveryLabel(recoveryAction)}</span>
          )}
        </div>
      </div>
      <div className="featured-project-actions">
        <PrimaryButton label={snapshot.chapters.length === 0 ? '开始创作' : '继续创作'} onClick={onGenerate} />
        {snapshot.chapters.length > 0 && (
          <SecondaryButton label="继续阅读" onClick={onRead} />
        )}
      </div>
    </div>
  )
}
