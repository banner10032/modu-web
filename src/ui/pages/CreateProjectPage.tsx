/**
 * 创建项目页面 — 从 Kotlin S5CreateProjectSheet 翻译。
 */

import { useState } from 'react'
import { type ContentScale, ContentScale as ContentScaleEnum, type PlotPace, PlotPace as PlotPaceEnum, type ProjectSnapshot, type WritingSkillImport, type WritingSkillState } from '../../core/domain'
import { contentScaleDisplayName, plotPaceDisplayName, WritingSkillStatus } from '../../core/domain'
import { buildInitialProjectDraft, GENRE_PRESETS, RELATIONSHIP_PRESETS, VIEWPOINT_PRESETS, TONE_PRESETS, composeGenre, type ProjectDraft } from '../presets'
import { BottomSheet, PrimaryButton, SecondaryButton, PresetRow } from '../components'
import { WritingSkillParser } from '../../data/writing-skill'

export function CreateProjectSheet({ onDismiss, onConfirm, writingSkill, writingSkillError, onChooseWritingSkill, onUpdateWritingSkill, onRemoveWritingSkill }: {
  onDismiss: () => void
  onConfirm: (draft: ProjectDraft) => void
  writingSkill?: WritingSkillImport | null
  writingSkillError?: string | null
  onChooseWritingSkill: () => void
  onUpdateWritingSkill: (skill: WritingSkillImport) => void
  onRemoveWritingSkill: () => void
}) {
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [protagonist, setProtagonist] = useState('')
  const [tone, setTone] = useState('')
  const [premise, setPremise] = useState('')
  const [selectedGenreMain, setSelectedGenreMain] = useState<string | null>(null)
  const [selectedGenreDetails, setSelectedGenreDetails] = useState<string[]>([])
  const [selectedRelationship, setSelectedRelationship] = useState<string | null>(null)
  const [selectedViewpoint, setSelectedViewpoint] = useState<string | null>(null)
  const [selectedTone, setSelectedTone] = useState<string | null>(null)
  const [selectedContentScale, setSelectedContentScale] = useState<ContentScale>(ContentScaleEnum.QING_XU)
  const [selectedPlotPace, setSelectedPlotPace] = useState<PlotPace>(PlotPaceEnum.BALANCED)
  const [writingSkillExpanded, setWritingSkillExpanded] = useState(false)
  const [preview, setPreview] = useState<ProjectDraft | null>(null)

  const valid = [title, genre, protagonist, tone, premise].every(s => s.trim())

  if (preview) {
    return (
      <BottomSheet title="确认小说信息" onClose={() => setPreview(null)}>
        <div className="confirm-card">
          <h3 className="confirm-title">{preview.project.title}</h3>
          <p className="confirm-meta">{preview.project.genre} · {preview.project.protagonist} · {preview.project.tone}</p>
          <p className="confirm-meta">叙事尺度：{contentScaleDisplayName(preview.project.contentScale)}</p>
          <p className="confirm-meta">剧情节奏：{plotPaceDisplayName(preview.project.plotPace)}</p>
          <p className="confirm-premise">{preview.project.premise}</p>
          {preview.writingSkill?.qualityCard && (
            <p className="confirm-meta">已确认质量卡：{preview.writingSkill.qualityCard.name}</p>
          )}
        </div>
        <p className="muted-text">后续章节方向只在后台维护，不会显示在目录或阅读页。</p>
        <PrimaryButton label="确认并创建" onClick={() => onConfirm(preview)} />
        <SecondaryButton label="返回修改" onClick={() => setPreview(null)} />
      </BottomSheet>
    )
  }

  return (
    <BottomSheet title="创建小说" onClose={onDismiss}>
      <input className="text-field" placeholder="书名" value={title} onChange={e => setTitle(e.target.value.slice(0, 80))} />

      <h3 className="form-section-title">题材预设</h3>
      <p className="muted-text">先选主分类，再选 0–3 个细分类；关系和视角独立可选。最终结果仍可手动编辑。</p>
      <PresetRow label="主分类" options={Object.keys(GENRE_PRESETS)} selected={o => o === selectedGenreMain} onSelect={main => {
        setSelectedGenreMain(main); setSelectedGenreDetails([])
        setGenre(composeGenre(main, [], selectedRelationship, selectedViewpoint))
      }} />
      {selectedGenreMain && (
        <PresetRow label="细分类（最多 3 项）" options={GENRE_PRESETS[selectedGenreMain]} selected={o => selectedGenreDetails.includes(o)} onSelect={detail => {
          const next = selectedGenreDetails.includes(detail) ? selectedGenreDetails.filter(d => d !== detail)
            : selectedGenreDetails.length < 3 ? [...selectedGenreDetails, detail] : selectedGenreDetails
          setSelectedGenreDetails(next)
          setGenre(composeGenre(selectedGenreMain, next, selectedRelationship, selectedViewpoint))
        }} />
      )}
      <PresetRow label="关系（可选）" options={RELATIONSHIP_PRESETS} selected={o => o === selectedRelationship} onSelect={rel => {
        const next = rel === selectedRelationship ? null : rel
        setSelectedRelationship(next)
        setGenre(composeGenre(selectedGenreMain, selectedGenreDetails, next, selectedViewpoint))
      }} />
      <PresetRow label="视角（可选）" options={VIEWPOINT_PRESETS} selected={o => o === selectedViewpoint} onSelect={vp => {
        const next = vp === selectedViewpoint ? null : vp
        setSelectedViewpoint(next)
        setGenre(composeGenre(selectedGenreMain, selectedGenreDetails, selectedRelationship, next))
      }} />
      <input className="text-field" placeholder="最终题材（可编辑）" value={genre} onChange={e => setGenre(e.target.value.slice(0, 80))} />
      <input className="text-field" placeholder="主角" value={protagonist} onChange={e => setProtagonist(e.target.value.slice(0, 80))} />

      <h3 className="form-section-title">基调</h3>
      <p className="muted-text">决定正文的语气、节奏、描写密度和情绪温度；不会改变题材、模型、篇幅或内容规则。</p>
      <PresetRow label="常用基调" options={TONE_PRESETS} selected={o => o === selectedTone} onSelect={preset => { setSelectedTone(preset); setTone(preset) }} />
      <input className="text-field" placeholder="最终基调（可编辑）" value={tone} onChange={e => setTone(e.target.value.slice(0, 80))} />

      <h3 className="form-section-title">叙事尺度</h3>
      <PresetRow label="描写层级" options={[ContentScaleEnum.QING_XU, ContentScaleEnum.AN_YONG, ContentScaleEnum.CHEN_JIN].map(contentScaleDisplayName)} selected={o => o === contentScaleDisplayName(selectedContentScale)} onSelect={label => setSelectedContentScale([ContentScaleEnum.QING_XU, ContentScaleEnum.AN_YONG, ContentScaleEnum.CHEN_JIN].find(s => contentScaleDisplayName(s) === label)!)} />

      <h3 className="form-section-title">剧情节奏</h3>
      <PresetRow label="推进速度" options={[PlotPaceEnum.EXPANSIVE, PlotPaceEnum.BALANCED, PlotPaceEnum.TIGHT].map(plotPaceDisplayName)} selected={o => o === plotPaceDisplayName(selectedPlotPace)} onSelect={label => setSelectedPlotPace([PlotPaceEnum.EXPANSIVE, PlotPaceEnum.BALANCED, PlotPaceEnum.TIGHT].find(p => plotPaceDisplayName(p) === label)!)} />

      <textarea className="text-field text-area" placeholder="核心设定" value={premise} onChange={e => setPremise(e.target.value.slice(0, 600))} rows={3} />

      <div className="collapsible-header" onClick={() => setWritingSkillExpanded(!writingSkillExpanded)}>
        <div>
          <span className="form-section-title">创作 Skill（可选）</span>
          <span className="muted-text">本书专用写作规则</span>
        </div>
        <span className="collapsible-toggle">{writingSkillExpanded ? '收起' : '展开'}</span>
      </div>
      {writingSkillExpanded && (
        <WritingSkillPreview
          writingSkill={writingSkill}
          error={writingSkillError}
          onChoose={onChooseWritingSkill}
          onConfirm={(edited) => onUpdateWritingSkill(edited)}
          onRemove={onRemoveWritingSkill}
        />
      )}

      <p className="muted-text">确认后，墨渡会在本机建立后续写作所需的连续性状态；不会调用模型。</p>
      <PrimaryButton label="确认信息" onClick={() => {
        const draft = buildInitialProjectDraft(title, genre, protagonist, tone, premise, selectedContentScale, selectedPlotPace)
        if (writingSkill) draft.writingSkill = writingSkill
        setPreview(draft)
      }} disabled={!valid} />
    </BottomSheet>
  )
}

export function WritingSkillPreview({ writingSkill, error, onChoose, onConfirm, onRemove }: {
  writingSkill?: WritingSkillImport | null
  error?: string | null
  onChoose: () => void
  onConfirm: (edited: WritingSkillImport) => void
  onRemove: () => void
}) {
  const card = writingSkill?.qualityCard
  const [cardName, setCardName] = useState(card?.name ?? '')
  const [ruleLines, setRuleLines] = useState(card?.rules.join('\n') ?? '')
  const [avoidLines, setAvoidLines] = useState(card?.avoid.join('\n') ?? '')
  const [termLines, setTermLines] = useState(card?.preferredTerms.join('\n') ?? '')

  if (error) return <p className="error-text">{error}</p>
  if (!writingSkill) {
    return (
      <>
        <SecondaryButton label="选择 .md 或 .json" onClick={onChoose} />
        <p className="muted-text">未导入时继续使用墨渡默认质量卡。</p>
      </>
    )
  }

  const lines = (s: string) => s.split('\n').map(l => l.trim()).filter(l => l)
  const itemCount = lines(ruleLines).length + lines(avoidLines).length + lines(termLines).length
  const charCount = lines(ruleLines).join('').length + lines(avoidLines).join('').length + lines(termLines).join('').length

  return (
    <div className="writing-skill-preview">
      <p className="muted-text">{writingSkill.sourceFileName} · {writingSkill.format.toLowerCase()} · {card?.sha256.slice(0, 8)}</p>
      <input className="text-field" placeholder="质量卡名称" value={cardName} onChange={e => setCardName(e.target.value.slice(0, 80))} />
      <textarea className="text-field text-area" placeholder="写作规则（每行一条）" value={ruleLines} onChange={e => setRuleLines(e.target.value)} rows={3} />
      <textarea className="text-field text-area" placeholder="避免事项（每行一条）" value={avoidLines} onChange={e => setAvoidLines(e.target.value)} rows={2} />
      <textarea className="text-field text-area" placeholder="用词偏好（可空）" value={termLines} onChange={e => setTermLines(e.target.value)} rows={1} />
      <p className="muted-text">{itemCount} / 8 条 · {charCount} / 1600 字符</p>
      {itemCount === 0 && <p className="error-text">未自动识别出规则，请在上方手动填写。</p>}
      <PrimaryButton
        label="确认质量卡"
        onClick={() => {
          try {
            const edited = new WritingSkillParser().editQualityCard(writingSkill, cardName, lines(ruleLines), lines(avoidLines), lines(termLines))
            onConfirm(edited)
          } catch {
            alert('请保留 1–8 条安全规则，合计不超过 1600 字符。')
          }
        }}
        disabled={itemCount < 1 || itemCount > 8 || charCount < 1 || charCount > 1600}
      />
      <div className="writing-skill-actions">
        <SecondaryButton label="替换文件" onClick={onChoose} />
        <SecondaryButton label="移除" onClick={onRemove} />
      </div>
    </div>
  )
}

export function WritingSkillSheet({ projectTitle, current, candidate, error, onDismiss, onChoose, onApply, onRemove, onDiscardCandidate }: {
  projectTitle: string
  current: WritingSkillState
  candidate?: WritingSkillImport | null
  error?: string | null
  onDismiss: () => void
  onChoose: () => void
  onApply: (imported: WritingSkillImport) => void
  onRemove: () => void
  onDiscardCandidate: () => void
}) {
  return (
    <BottomSheet title="创作 Skill" onClose={onDismiss}>
      <p className="muted-text">《{projectTitle}》· 只影响后续正文的写法</p>
      {current.status === WritingSkillStatus.ACTIVE && current.qualityCard && (
        <div className="skill-current">
          <span className="skill-active-badge">已应用质量卡</span>
          <p>{current.qualityCard.name} · v{current.qualityCard.version} · {current.qualityCard.sha256.slice(0, 8)}</p>
        </div>
      )}
      {current.status === WritingSkillStatus.DISABLED_CORRUPT && (
        <p className="error-text">现有 Skill 已损坏并安全禁用；正文与已有章节不受影响。</p>
      )}
      {current.status === WritingSkillStatus.NONE && (
        <p className="muted-text">当前使用墨渡默认质量卡。</p>
      )}
      <WritingSkillPreview writingSkill={candidate} error={error} onChoose={onChoose} onConfirm={onApply} onRemove={onDiscardCandidate} />
      {current.status !== WritingSkillStatus.NONE && (
        <button className="btn btn-text btn-danger-text" onClick={onRemove}>移除当前创作 Skill</button>
      )}
    </BottomSheet>
  )
}
