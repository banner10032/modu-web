/**
 * Provider 设置页面 — 从 Kotlin S1ProviderSettingsScreen 翻译。
 */

import { useState } from 'react'
import type { ProviderSummary, ProviderSetupInput, ProviderFailure, ConnectionTestResult } from '../../core/provider-contract'
import { ProviderKind, PROVIDER_PRESETS, PROVIDER_DEFAULTS, findPreset, normalizeEndpoint, providerKindLabel } from '../../core/provider-contract'
import { BrandBar, PrimaryButton } from '../components'
import type { ReaderPreferences } from '../theme'
import { FONT_SIZES, FONT_SIZE_LABELS, LINE_HEIGHTS, LINE_HEIGHT_LABELS } from '../theme'

export function ProviderSettingsPage({ provider, onSaved, profilesLocked, preferences, onPreferencesChange }: {
  provider: { connectionProfiles: () => ProviderSummary[]; connectionSummary: () => ProviderSummary | null; selectConnectionProfile: (id: string) => { ok: boolean }; deleteConnectionProfile: (id: string) => { ok: boolean }; testAndSaveConnection: (input: ProviderSetupInput) => Promise<ConnectionTestResult> }
  onSaved: () => void
  profilesLocked: boolean
  preferences: ReaderPreferences
  onPreferencesChange: (prefs: ReaderPreferences) => void
}) {
  const [profiles, setProfiles] = useState(provider.connectionProfiles())
  const [active, setActive] = useState(provider.connectionSummary())
  const [editing, setEditing] = useState<ProviderSummary | null>(null)
  const [editorVisible, setEditorVisible] = useState(profiles.length === 0)
  const [operationMessage, setOperationMessage] = useState<string | null>(null)

  function refresh() {
    setProfiles(provider.connectionProfiles())
    setActive(provider.connectionSummary())
    onSaved()
  }

  return (
    <div className="page settings-page">
      <BrandBar title="设置" />
      <h2 className="page-heading">我的 API</h2>
      <p className="muted-text">保存多组兼容配置，写作前一键切换。API Key 仍只在本机加密保存。</p>

      {profiles.map(profile => {
        const selected = active?.providerId === profile.providerId
        return (
          <div
            key={profile.providerId}
            className={`provider-card ${selected ? 'selected' : ''}`}
            onClick={() => {
              if (!profilesLocked && !selected) {
                provider.selectConnectionProfile(profile.providerId)
                refresh()
                setOperationMessage(`已切换为 ${profile.displayName}`)
              }
            }}
          >
            <div className="provider-card-header">
              <span className="provider-card-name">{profile.displayName}</span>
              {selected && <span className="provider-card-active">当前使用</span>}
            </div>
            <p className="muted-text">{providerKindLabel(profile.kind)} · {profile.model}</p>
            <p className="muted-text provider-card-url">{profile.normalizedChatCompletionsUrl}</p>
            <div className="provider-card-actions">
              <button className="btn btn-text" disabled={profilesLocked} onClick={(e) => { e.stopPropagation(); setEditing(profile); setEditorVisible(true) }}>编辑</button>
              <button className="btn btn-text btn-danger-text" disabled={profilesLocked} onClick={(e) => {
                e.stopPropagation()
                const result = provider.deleteConnectionProfile(profile.providerId)
                if (result.ok) { refresh(); setOperationMessage('配置已删除') }
                else setOperationMessage('当前任务正在使用该配置，暂时不能删除')
              }}>删除</button>
            </div>
          </div>
        )
      })}

      {!editorVisible && (
        <PrimaryButton label="添加 API" onClick={() => { setEditing(null); setEditorVisible(true) }} disabled={profilesLocked} />
      )}

      {operationMessage && <p className="info-text">{operationMessage}</p>}
      {profilesLocked && <p className="muted-text">章节生成期间配置已锁定；完成或停止后可以切换。</p>}

      {editorVisible && (
        <ProviderEditor
          provider={provider}
          editing={editing}
          onSaved={(summary) => { setEditing(null); setEditorVisible(false); refresh(); setOperationMessage(`${summary.displayName} 已验证并保存`) }}
          onCancel={() => { if (profiles.length > 0) { setEditing(null); setEditorVisible(false) } }}
        />
      )}

      <hr className="divider" />
      <ReaderSettingsSection preferences={preferences} onChange={onPreferencesChange} />
    </div>
  )
}

function ProviderEditor({ provider, editing, onSaved, onCancel }: {
  provider: { testAndSaveConnection: (input: ProviderSetupInput) => Promise<ConnectionTestResult> }
  editing: ProviderSummary | null
  onSaved: (summary: ProviderSummary) => void
  onCancel: () => void
}) {
  const initialKind = editing?.kind ?? ProviderKind.OPENAI_COMPATIBLE
  const [kind, setKind] = useState(initialKind)
  const initialPreset = editing?.kind ? findPreset(editing.kind) : PROVIDER_PRESETS[0]
  const [displayName, setDisplayName] = useState(editing?.displayName ?? initialPreset.displayName)
  const [endpoint, setEndpoint] = useState(editing?.baseUrl ?? initialPreset.baseUrl)
  const [model, setModel] = useState(editing?.model ?? initialPreset.models[0] ?? '')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showTuning, setShowTuning] = useState(false)
  const [connectTimeout, setConnectTimeout] = useState(String(editing?.connectTimeoutSeconds ?? PROVIDER_DEFAULTS.CONNECT_TIMEOUT_SECONDS))
  const [readTimeout, setReadTimeout] = useState(String(editing?.readTimeoutSeconds ?? PROVIDER_DEFAULTS.READ_TIMEOUT_SECONDS))
  const [totalTimeout, setTotalTimeout] = useState(String(editing?.totalTimeoutSeconds ?? PROVIDER_DEFAULTS.TOTAL_TIMEOUT_SECONDS))
  const [maxCharacters, setMaxCharacters] = useState(String(editing?.maxProseCharacters ?? PROVIDER_DEFAULTS.MAX_PROSE_CHARACTERS))
  const [testing, setTesting] = useState(false)
  const [failure, setFailure] = useState<ProviderFailure | null>(null)

  const preview = normalizeEndpoint(endpoint)
  const keyValid = (apiKey.length === 0 && editing != null) || (apiKey.length >= 8 && apiKey.length <= 16384 && !/\s/.test(apiKey))
  const numericValid = [connectTimeout, readTimeout, totalTimeout, maxCharacters].every(s => {
    const n = parseInt(s)
    return !isNaN(n)
  }) && parseInt(connectTimeout) >= 5 && parseInt(connectTimeout) <= 60
    && parseInt(readTimeout) >= 30 && parseInt(readTimeout) <= 600
    && parseInt(totalTimeout) >= 60 && parseInt(totalTimeout) <= 1800
    && parseInt(maxCharacters) >= 1000 && parseInt(maxCharacters) <= 30000
  const canSubmit = !testing && keyValid && preview.ok && model.trim() && displayName.trim() && numericValid

  const [selectedPresetIndex, setSelectedPresetIndex] = useState(() => editing?.kind ? PROVIDER_PRESETS.findIndex(p => p.kind === editing.kind) : 0)

  function selectPresetByIndex(index: number) {
    const preset = PROVIDER_PRESETS[index]
    setSelectedPresetIndex(index)
    setKind(preset.kind)
    setEndpoint(preset.baseUrl)
    setModel(preset.models[0] ?? '')
    setDisplayName(preset.displayName)
    setFailure(null)
  }

  return (
    <div className="provider-editor">
      <h3 className="editor-title">{editing ? '编辑 API' : '添加 API'}</h3>
      <span className="form-section-title">选择平台</span>
      <div className="preset-chips">
        {PROVIDER_PRESETS.map((preset, index) => (
          <button
            key={index}
            className={`preset-chip ${selectedPresetIndex === index ? 'selected' : ''}`}
            onClick={() => selectPresetByIndex(index)}
          >
            {preset.displayName}
          </button>
        ))}
      </div>

      <input className="text-field" placeholder="配置名称" value={displayName} onChange={e => { setDisplayName(e.target.value.slice(0, 80)); setFailure(null) }} />

      {!PROVIDER_PRESETS[selectedPresetIndex]?.baseUrl ? (
        <input className="text-field" placeholder="接口地址" value={endpoint} onChange={e => { setEndpoint(e.target.value); setFailure(null) }} />
      ) : (
        <p className="muted-text">接口已自动配置：{preview.ok ? preview.value.host : endpoint}</p>
      )}

      {PROVIDER_PRESETS[selectedPresetIndex]?.models.length > 0 && (
        <div className="preset-chips">
          {PROVIDER_PRESETS[selectedPresetIndex].models.map(option => (
            <button key={option} className={`preset-chip ${model === option ? 'selected' : ''}`} onClick={() => { setModel(option); setFailure(null) }}>{option}</button>
          ))}
        </div>
      )}
      <input className="text-field" placeholder="模型 ID" value={model} onChange={e => { setModel(e.target.value.slice(0, 200)); setFailure(null) }} />

      <input
        className="text-field"
        type={showKey ? 'text' : 'password'}
        placeholder="API Key"
        value={apiKey}
        onChange={e => { setApiKey(e.target.value); setFailure(null) }}
      />
      <button className="btn btn-text" onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</button>

      <button className="btn btn-text" onClick={() => setShowTuning(!showTuning)}>{showTuning ? '收起高级设置' : '高级设置'}</button>
      {showTuning && (
        <>
          <NumberField label="连接超时（秒）" value={connectTimeout} onChange={setConnectTimeout} range="5–60" />
          <NumberField label="读取超时（秒）" value={readTimeout} onChange={setReadTimeout} range="30–600" />
          <NumberField label="单章总超时（秒）" value={totalTimeout} onChange={setTotalTimeout} range="60–1800" />
          <NumberField label="正文字符上限" value={maxCharacters} onChange={setMaxCharacters} range="1000–30000" />
        </>
      )}

      {failure && (
        <div className="failure-card">
          <strong>连接未保存</strong>
          <p>{failure.safeMessage}</p>
        </div>
      )}

      <PrimaryButton
        label={testing ? '正在验证…' : '测试并保存'}
        onClick={async () => {
          setTesting(true); setFailure(null)
          const input: ProviderSetupInput = {
            baseUrl: endpoint, apiKey, model,
            connectTimeoutSeconds: parseInt(connectTimeout), readTimeoutSeconds: parseInt(readTimeout),
            totalTimeoutSeconds: parseInt(totalTimeout), maxProseCharacters: parseInt(maxCharacters),
            profileId: editing?.providerId ?? null, displayName, kind,
          }
          try {
            const result = await provider.testAndSaveConnection(input)
            if (result.type === 'Saved') onSaved(result.summary)
            else setFailure(result.failure)
          } finally {
            setApiKey(''); setShowKey(false); setTesting(false)
          }
        }}
        disabled={!canSubmit}
      />
      {editing && <button className="btn btn-text" onClick={onCancel}>取消编辑</button>}
    </div>
  )
}

function NumberField({ label, value, onChange, range }: { label: string; value: string; onChange: (v: string) => void; range: string }) {
  return (
    <div>
      <input className="text-field" type="number" placeholder={label} value={value} onChange={e => { if (/^\d*$/.test(e.target.value)) onChange(e.target.value) }} />
      <span className="muted-text">允许范围：{range}</span>
    </div>
  )
}

function ReaderSettingsSection({ preferences, onChange }: { preferences: ReaderPreferences; onChange: (p: ReaderPreferences) => void }) {
  return (
    <div className="reader-settings">
      <h2 className="page-heading">阅读设置</h2>
      <p className="muted-text">字号、行距和主题只保存在本机。</p>

      <h3 className="form-section-title">正文字号</h3>
      <div className="preset-chips">
        {FONT_SIZES.map(size => (
          <button key={size} className={`preset-chip ${preferences.fontSize === size ? 'selected' : ''}`} onClick={() => onChange({ ...preferences, fontSize: size })}>
            {FONT_SIZE_LABELS[size]}
          </button>
        ))}
      </div>

      <h3 className="form-section-title">正文行距</h3>
      <div className="preset-chips">
        {LINE_HEIGHTS.map(height => (
          <button key={height} className={`preset-chip ${preferences.lineHeight === height ? 'selected' : ''}`} onClick={() => onChange({ ...preferences, lineHeight: height })}>
            {LINE_HEIGHT_LABELS[height]}
          </button>
        ))}
      </div>

      <h3 className="form-section-title">显示主题</h3>
      <div className="preset-chips">
        {(['SYSTEM', 'LIGHT', 'DARK'] as const).map(theme => (
          <button key={theme} className={`preset-chip ${preferences.theme === theme ? 'selected' : ''}`} onClick={() => onChange({ ...preferences, theme })}>
            {theme === 'SYSTEM' ? '跟随系统' : theme === 'LIGHT' ? '浅色' : '深色'}
          </button>
        ))}
      </div>
    </div>
  )
}
