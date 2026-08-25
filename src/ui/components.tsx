/**
 * 通用编辑式 UI 组件 — 从 Kotlin S6EditorialComponents.kt 翻译。
 */

import type { ReactNode } from 'react'
import type { ChapterState } from '../core/domain'

export function chapterStateEditorialLabel(state: ChapterState): string {
  const labels: Record<ChapterState, string> = {
    PLANNED: '已规划',
    WRITING: '写作中',
    READABLE_DRAFT: '可读草稿',
    NEEDS_REVIEW: '待检查',
    COMMITTED: '已完成',
    PAUSED: '已暂停',
  }
  return labels[state]
}

export function BrandBar({ title, actionIcon, actionDescription, onAction }: {
  title: string
  actionIcon?: string
  actionDescription?: string
  onAction?: () => void
}) {
  return (
    <div className="brand-bar">
      <div className="brand-bar-left">
        <span className="brand-logo">织</span>
        <span className="brand-name">织卷</span>
      </div>
      <h1 className="brand-bar-title">{title}</h1>
      {actionIcon && onAction && (
        <button className="brand-bar-action" onClick={onAction} title={actionDescription}>
          {actionIcon}
        </button>
      )}
    </div>
  )
}

export function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="section-header">
      <h2 className="section-title">{title}</h2>
      {meta && <>
        <span className="section-divider" />
        <span className="section-meta">{meta}</span>
      </>}
    </div>
  )
}

export function PrimaryButton({ label, onClick, disabled, icon }: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon?: string
}) {
  return (
    <button className="btn btn-primary" onClick={onClick} disabled={disabled}>
      {icon && <span className="btn-icon">{icon}</span>}
      {label}
    </button>
  )
}

export function SecondaryButton({ label, onClick, disabled, icon }: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon?: string
}) {
  return (
    <button className="btn btn-secondary" onClick={onClick} disabled={disabled}>
      {icon && <span className="btn-icon">{icon}</span>}
      {label}
    </button>
  )
}

export function BookCover({ title, compact }: { title: string; compact?: boolean }) {
  const visibleTitle = title.trim().slice(0, compact ? 8 : 12)
  return (
    <div className={`book-cover ${compact ? 'compact' : ''}`}>
      <div className="book-cover-inner">
        <span className="book-cover-label">{compact ? '长篇' : '长篇\n小说'}</span>
        <span className="book-cover-divider" />
        <span className="book-cover-title">{visibleTitle.split('').join('\n')}</span>
      </div>
    </div>
  )
}

export function StateLabel({ text, color }: { text: string; color?: string }) {
  return <span className="state-label" style={color ? { borderColor: color, color } : undefined}>{text}</span>
}

export function Modal({ title, onClose, children, footer }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function BottomSheet({ title, onClose, children }: {
  title?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet-content" onClick={e => e.stopPropagation()}>
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

export function AlertDialog({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger }: {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="alert-content" onClick={e => e.stopPropagation()}>
        <h2 className="alert-title">{title}</h2>
        <p className="alert-message">{message}</p>
        <div className="alert-actions">
          <button className="btn btn-text" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function PresetChip({ label, selected, onClick }: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`preset-chip ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {selected && <span className="preset-chip-check">✓</span>}
      {label}
    </button>
  )
}

export function PresetRow({ label, options, selected, onSelect }: {
  label: string
  options: string[]
  selected: (option: string) => boolean
  onSelect: (option: string) => void
}) {
  return (
    <div className="preset-row">
      <span className="preset-row-label">{label}</span>
      <div className="preset-chips">
        {options.map((option, index) => (
          <PresetChip
            key={index}
            label={option}
            selected={selected(option)}
            onClick={() => onSelect(option)}
          />
        ))}
      </div>
    </div>
  )
}
