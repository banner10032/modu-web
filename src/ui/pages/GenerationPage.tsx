/**
 * 生成/续写页面 — 从 Kotlin GenerationScreen 翻译。
 */

import { useState } from 'react'
import type { ProjectSnapshot } from '../../core/domain'
import { ChapterState } from '../../core/domain'
import type { RecoveryAction } from '../../core/generation-job'
import { planWindowNeedsRefresh } from '../../core/continuity'
import type { GenerationUiState } from '../store'
import { jobStageLabel } from '../store'
import { PrimaryButton, SecondaryButton } from '../components'
import type { ProviderSummary } from '../../core/provider-contract'

export function GenerationPage({
  snapshot, isBusy, serviceStatus, recoveryAction, providerSummary,
  onBack, onGenerate, onRetrySettlement, onCancel, onRefreshPlan, onRead,
}: {
  snapshot: ProjectSnapshot | null
  isBusy: boolean
  serviceStatus: GenerationUiState
  recoveryAction: RecoveryAction
  providerSummary: ProviderSummary | null
  onBack: () => void
  onGenerate: (chapterCount: number) => void
  onRetrySettlement: () => void
  onCancel: () => void
  onRefreshPlan: () => void
  onRead: () => void
}) {
  const chapter = snapshot?.chapters[snapshot.chapters.length - 1]
  const nextChapter = snapshot?.storyState.nextChapter ?? 1
  const [requestedCount, setRequestedCount] = useState(1)
  const availableBatchCount = Math.min(3, snapshot?.plan.length ?? 0) || 1

  if (!snapshot) {
    return (
      <div className="page generation-page">
        <div className="page-header">
          <button className="btn btn-text" onClick={onBack}>← 返回</button>
          <h2 className="page-title">续写</h2>
        </div>
        <p>没有可续写的作品</p>
        <p className="muted-text">请先从书库选择一本书。</p>
      </div>
    )
  }

  return (
    <div className="page generation-page">
      <div className="page-header">
        <button className="btn btn-text" onClick={onBack}>← 返回</button>
        <h2 className="page-title">{snapshot.project.title}</h2>
      </div>
      <hr className="divider" />

      <h1 className="generation-heading">续写</h1>
      <div className="generation-card">
        <h3>第 {nextChapter} 章</h3>
        <p className="muted-text">已完成 {snapshot.storyState.committedChapters.length} 章</p>
        <p className={providerSummary ? 'provider-active' : 'error-text'}>
          当前 API：{providerSummary?.displayName ?? '尚未配置'}
        </p>
      </div>

      {chapter && chapter.state !== ChapterState.COMMITTED && (
        <div className="generation-draft-card">
          <p className="primary-text">第 {chapter.number} 章</p>
          <p className="muted-text">{chapter.state === ChapterState.READABLE_DRAFT ? '可读草稿' : chapter.state === ChapterState.PAUSED ? '已暂停' : '待检查'}</p>
          <p className="muted-text">正文已保存在本机，可阅读或按当前状态继续处理。</p>
        </div>
      )}

      {isBusy ? (
        <>
          <p className="muted-text">
            {serviceStatus.type === 'Running' && serviceStatus.batchTotal > 1
              ? `批次 ${serviceStatus.batchPosition}/${serviceStatus.batchTotal} · ${jobStageLabel(serviceStatus.stage)}`
              : serviceStatus.type === 'Running' ? jobStageLabel(serviceStatus.stage) : '正在生成，请稍候…'}
          </p>
          <PrimaryButton label="停止生成" onClick={onCancel} />
        </>
      ) : chapter && (chapter.state === ChapterState.READABLE_DRAFT || chapter.state === ChapterState.NEEDS_REVIEW) ? (
        <>
          <p className="muted-text">正文已保留；这里只重新整理状态，不会重写正文。</p>
          <PrimaryButton label="只重试结算" onClick={onRetrySettlement} />
        </>
      ) : chapter && chapter.state === ChapterState.PAUSED ? (
        <>
          <p className="error-text">{incompleteDraftMessage(chapter.incompleteReason ?? '')}</p>
          <PrimaryButton label={`重新生成第 ${chapter.number} 章`} onClick={() => onGenerate(1)} />
        </>
      ) : recoveryAction === 'CONFIRM_RESEND' ? (
        <>
          <p className="muted-text">上次请求结果无法确认；只有明确点击才会重新发送。</p>
          <PrimaryButton label="确认重发正文" onClick={() => onGenerate(1)} />
        </>
      ) : planWindowNeedsRefresh(snapshot.plan.length) || snapshot.plan.length === 0 ? (
        <>
          <p className="muted-text">需要先在本机准备后续章节。这个操作不调用模型，也不会自动开始生成。</p>
          <PrimaryButton label="准备后续章节" onClick={onRefreshPlan} />
        </>
      ) : !providerSummary ? (
        <p className="error-text">请先到设置添加并验证一个 API。</p>
      ) : (
        <>
          <BatchSelector selectedCount={requestedCount} availableCount={availableBatchCount} onSelected={setRequestedCount} />
          <PrimaryButton
            label={requestedCount === 1 ? `续写第 ${nextChapter} 章` : `顺序续写 ${requestedCount} 章`}
            onClick={() => onGenerate(requestedCount)}
          />
        </>
      )}

      {chapter && (
        <SecondaryButton label={chapter.state === ChapterState.COMMITTED ? '继续阅读' : '阅读已保存正文'} onClick={onRead} />
      )}
    </div>
  )
}

function BatchSelector({ selectedCount, availableCount, onSelected }: {
  selectedCount: number
  availableCount: number
  onSelected: (count: number) => void
}) {
  return (
    <div className="batch-selector">
      <div className="batch-selector-header">
        <span className="batch-selector-title">本次续写</span>
        <span className="muted-text">默认 1 章</span>
      </div>
      <div className="batch-selector-buttons">
        {[1, 2, 3].map(count => (
          <button
            key={count}
            className={`batch-button ${selectedCount === count ? 'selected' : ''}`}
            disabled={count > availableCount}
            onClick={() => onSelected(count)}
          >
            {count} 章
          </button>
        ))}
      </div>
      <p className="muted-text">本次最多 {selectedCount * 2} 次模型调用；每章仍先独立保存、结算并提交，再开始下一章。</p>
      <p className="muted-text">选择 2–3 章不会并行生成，但会减少中途审阅和调整后续方向的机会。</p>
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
