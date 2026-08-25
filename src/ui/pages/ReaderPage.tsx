/**
 * 阅读页面 — 从 Kotlin ReaderScreen 翻译。
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { ProjectSnapshot, Chapter } from '../../core/domain'
import { ChapterState } from '../../core/domain'
import type { ReaderPreferences } from '../theme'
import { getColors } from '../theme'
import type { ReaderPosition } from '../store'
import { planWindowNeedsRefresh } from '../../core/continuity'
import { PrimaryButton, BottomSheet, chapterStateEditorialLabel, StateLabel } from '../components'

export function ReaderPage({
  snapshot, preferences, initialPosition, onPositionChange, onBack, onReturnToCreation,
  generationInProgress, onOpenGeneration, onContinueWriting,
}: {
  snapshot: ProjectSnapshot | null
  preferences: ReaderPreferences
  initialPosition: ReaderPosition | null
  onPositionChange: (position: ReaderPosition) => void
  onBack: () => void
  onReturnToCreation: () => void
  generationInProgress: boolean
  onOpenGeneration: () => void
  onContinueWriting: (chapterCount: number) => void
}) {
  const chapters = (snapshot?.chapters ?? []).slice().sort((a, b) => a.number - b.number)
  const [selectedChapterNumber, setSelectedChapterNumber] = useState<number>(
    initialPosition?.chapterNumber && chapters.some(c => c.number === initialPosition.chapterNumber)
      ? initialPosition.chapterNumber
      : chapters[chapters.length - 1]?.number ?? -1
  )
  const [showDirectory, setShowDirectory] = useState(false)
  const [showContinueSheet, setShowContinueSheet] = useState(false)
  const [continueCount, setContinueCount] = useState(1)
  const [chromeVisible, setChromeVisible] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const colors = getColors(preferences.theme)

  const selectedIndex = Math.max(0, chapters.findIndex(c => c.number === selectedChapterNumber))
  const chapter = chapters[selectedIndex]
  const nextChapter = chapters[selectedIndex + 1]
  const autoNextChapter = nextChapter?.state === ChapterState.COMMITTED ? nextChapter : null

  // 恢复滚动位置
  useEffect(() => {
    if (!chapter || !scrollRef.current) return
    if (initialPosition?.chapterNumber === chapter.number) {
      scrollRef.current.scrollTop = initialPosition.scrollOffset
    }
  }, [chapter?.number])

  // 保存滚动位置（防抖）
  useEffect(() => {
    if (!chapter || !scrollRef.current) return
    const el = scrollRef.current
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        onPositionChange({ chapterNumber: chapter.number, scrollOffset: el.scrollTop })
      }, 250)
    }
    el.addEventListener('scroll', onScroll)
    return () => { el.removeEventListener('scroll', onScroll); clearTimeout(timer) }
  }, [chapter?.number, onPositionChange])

  if (!snapshot || chapters.length === 0 || !chapter) {
    return (
      <div className="page reader-page" style={{ background: colors.background, color: colors.onBackground }}>
        <div className="reader-empty">
          <h2>还没有可读章节</h2>
          <p className="muted-text">完成首章后，正文会出现在这里。</p>
        </div>
      </div>
    )
  }

  const readerBg = preferences.theme === 'DARK' || (preferences.theme === 'SYSTEM' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? colors.background
    : colors.paperLight

  return (
    <div className="page reader-page" style={{ background: readerBg, color: colors.onSurface }}>
      <div
        className="reader-content-toggle"
        onClick={() => setChromeVisible(!chromeVisible)}
      >
        <div className="reader-scroll-container" ref={scrollRef} style={{ maxHeight: '100vh', overflowY: 'auto' }}>
          <div className="reader-inner">
            <h1 className="reader-chapter-heading">第 {chapter.number} 章</h1>
            <div className="reader-chapter-underline" style={{ background: colors.primary }} />
            <div
              className="reader-prose"
              style={{
                fontFamily: 'serif',
                fontSize: `${preferences.fontSize}px`,
                lineHeight: `${preferences.lineHeight}px`,
              }}
            >
              {chapter.prose}
            </div>
            <div className="reader-end-hint">
              {autoNextChapter ? '继续上滑进入下一章' : nextChapter ? '下一章尚未完成' : '已读至当前最新章节'}
            </div>
          </div>
        </div>
      </div>

      {chromeVisible && (
        <div className="reader-chrome-top" style={{ background: readerBg }}>
          <button className="btn btn-text" onClick={onBack} style={{ color: colors.onSurface }}>← 返回</button>
          <span className="reader-chrome-title" style={{ color: colors.onSurface }}>{snapshot.project.title}</span>
          <button
            className="btn btn-text"
            onClick={() => generationInProgress ? onOpenGeneration() : setShowContinueSheet(true)}
            style={{ color: colors.primary }}
          >
            {generationInProgress ? '生成中' : '续写'}
          </button>
        </div>
      )}

      {chromeVisible && (
        <div className="reader-chrome-bottom" style={{ background: readerBg }}>
          <button
            className="btn btn-text"
            disabled={selectedIndex <= 0}
            onClick={() => setSelectedChapterNumber(chapters[selectedIndex - 1].number)}
            style={{ color: colors.onSurface }}
          >
            ← 上一章
          </button>
          <button className="btn btn-text" onClick={() => setShowDirectory(true)} style={{ color: colors.onSurface }}>
            目录 {selectedIndex + 1}/{chapters.length}
          </button>
          {selectedIndex < chapters.length - 1 ? (
            <button
              className="btn btn-text"
              onClick={() => setSelectedChapterNumber(chapters[selectedIndex + 1].number)}
              style={{ color: colors.onSurface }}
            >
              下一章 →
            </button>
          ) : (
            <button
              className="btn btn-text"
              onClick={() => generationInProgress ? onOpenGeneration() : setShowContinueSheet(true)}
              style={{ color: colors.primary }}
            >
              {generationInProgress ? '生成中' : '续写'} →
            </button>
          )}
        </div>
      )}

      {showContinueSheet && (
        <BottomSheet title="续写后续章节" onClose={() => setShowContinueSheet(false)}>
          <p className="muted-text">每章仍按正文、结构化结算的顺序独立完成；不会并行生成。</p>
          {snapshot.plan.length > 0 ? (
            <>
              <div className="batch-selector-buttons">
                {[1, 2, 3].map(count => (
                  <button
                    key={count}
                    className={`batch-button ${continueCount === count ? 'selected' : ''}`}
                    disabled={count > Math.min(3, snapshot.plan.length)}
                    onClick={() => setContinueCount(count)}
                  >
                    {count} 章
                  </button>
                ))}
              </div>
              <PrimaryButton
                label={continueCount === 1 ? `续写第 ${snapshot.storyState.nextChapter} 章` : `顺序续写 ${continueCount} 章`}
                onClick={() => { setShowContinueSheet(false); onContinueWriting(continueCount) }}
              />
            </>
          ) : (
            <>
              <p className="muted-text">后续章节尚未准备。</p>
              <PrimaryButton label="去准备后续章节" onClick={() => { setShowContinueSheet(false); onOpenGeneration() }} />
            </>
          )}
        </BottomSheet>
      )}

      {showDirectory && (
        <BottomSheet title="章节目录" onClose={() => setShowDirectory(false)}>
          <DirectoryList
            snapshot={snapshot}
            selectedChapterNumber={chapter.number}
            onChapterSelected={(num) => { setSelectedChapterNumber(num); setShowDirectory(false) }}
          />
        </BottomSheet>
      )}
    </div>
  )
}

function DirectoryList({ snapshot, selectedChapterNumber, onChapterSelected }: {
  snapshot: ProjectSnapshot
  selectedChapterNumber: number
  onChapterSelected: (number: number) => void
}) {
  const nextChapter = snapshot.storyState.nextChapter
  const completed = snapshot.chapters.filter(c => c.number < nextChapter).sort((a, b) => a.number - b.number)
  const futurePlan = snapshot.plan.filter(p => p.chapter > nextChapter).sort((a, b) => a.chapter - b.chapter)

  return (
    <div className="directory-list">
      {completed.length > 0 && <h3 className="directory-section-title">已完成</h3>}
      {completed.map(chapter => (
        <button
          key={chapter.number}
          className={`directory-chapter ${chapter.number === selectedChapterNumber ? 'selected' : ''}`}
          onClick={() => onChapterSelected(chapter.number)}
        >
          <span className="directory-chapter-check">✓</span>
          <span>第 {chapter.number} 章</span>
          <StateLabel text={chapterStateEditorialLabel(chapter.state)} />
        </button>
      ))}
      <h3 className="directory-section-title">当前</h3>
      <div className="directory-current">第 {nextChapter} 章 · 待写</div>
      {futurePlan.length > 0 && <h3 className="directory-section-title">待写章节</h3>}
      {futurePlan.map(plan => (
        <div key={plan.chapter} className="directory-future">
          <span>第 {plan.chapter} 章</span>
          <span className="muted-text">待写</span>
        </div>
      ))}
    </div>
  )
}
