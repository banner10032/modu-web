/**
 * Provider 协议与校验 — 从 Kotlin S1ProviderContract.kt 翻译。
 */

import type { ContentScale, PlotPace } from './domain'

// ─── Provider 种类 ──────────────────────────────────────────

export enum ProviderKind {
  DEEPSEEK = 'DEEPSEEK',
  QWEN = 'QWEN',
  GLM = 'GLM',
  KIMI = 'KIMI',
  OPENAI_COMPATIBLE = 'OPENAI_COMPATIBLE',
}

export function providerKindLabel(kind: ProviderKind): string {
  switch (kind) {
    case ProviderKind.DEEPSEEK: return 'DeepSeek'
    case ProviderKind.QWEN: return '通义千问'
    case ProviderKind.GLM: return '智谱 GLM'
    case ProviderKind.KIMI: return 'Kimi'
    case ProviderKind.OPENAI_COMPATIBLE: return '兼容服务'
  }
}

// ─── Provider 预设 ──────────────────────────────────────────

export interface ProviderPreset {
  kind: ProviderKind
  displayName: string
  baseUrl: string
  models: string[]
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { kind: ProviderKind.QWEN, displayName: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen3-235b-a22b-instruct-2507', 'qwen3-max'] },
  { kind: ProviderKind.DEEPSEEK, displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
  { kind: ProviderKind.GLM, displayName: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4.5', 'glm-4.5-flash'] },
  { kind: ProviderKind.KIMI, displayName: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k2.6', 'kimi-k2.5'] },
  { kind: ProviderKind.OPENAI_COMPATIBLE, displayName: '中转站 / 其他兼容服务', baseUrl: '', models: [] },
]

export function findPreset(kind: ProviderKind): ProviderPreset {
  return PROVIDER_PRESETS.find(p => p.kind === kind)!
}

// ─── 默认值 ────────────────────────────────────────────────

export const PROVIDER_DEFAULTS = {
  DISPLAY_NAME: '通义千问',
  BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  MODEL: 'qwen3-235b-a22b-instruct-2507',
  CONNECT_TIMEOUT_SECONDS: 15,
  READ_TIMEOUT_SECONDS: 180,
  TOTAL_TIMEOUT_SECONDS: 300,
  MAX_PROSE_CHARACTERS: 12000,
} as const

// ─── 设置输入 ────────────────────────────────────────────────

export interface ProviderSetupInput {
  baseUrl: string
  apiKey: string
  model: string
  connectTimeoutSeconds: number
  readTimeoutSeconds: number
  totalTimeoutSeconds: number
  maxProseCharacters: number
  profileId: string | null
  displayName: string
  kind: ProviderKind
}

// ─── 标准化端点 ──────────────────────────────────────────────

export interface NormalizedEndpoint {
  baseUrl: string
  chatCompletionsUrl: string
  host: string
  path: string
}

export function normalizeEndpoint(rawBaseUrl: string, allowHttp = false): { ok: true; value: NormalizedEndpoint } | { ok: false; error: string } {
  try {
    const trimmed = rawBaseUrl.trim()
    if (!trimmed) throw new Error('EMPTY')
    const parsed = new URL(trimmed)
    const scheme = parsed.protocol.replace(':', '').toLowerCase()
    if (scheme !== 'https' && !(allowHttp && scheme === 'http')) throw new Error('SCHEME')
    if (!parsed.hostname) throw new Error('HOST')
    if (parsed.username || parsed.hash) throw new Error('USERINFO')
    const rawPath = parsed.pathname || ''
    const normalizedPath = rawPath.endsWith('/chat/completions')
      ? rawPath
      : (rawPath.replace(/\/$/, '') + '/chat/completions')
    const portPart = parsed.port ? `:${parsed.port}` : ''
    const baseUrl = `${scheme}://${parsed.hostname}${portPart}${rawPath || ''}`
    const chatCompletionsUrl = `${scheme}://${parsed.hostname}${portPart}${normalizedPath}`
    return { ok: true, value: { baseUrl, chatCompletionsUrl, host: parsed.hostname, path: normalizedPath } }
  } catch {
    return { ok: false, error: 'CFG_INVALID_ENDPOINT' }
  }
}

// ─── Provider 摘要 ──────────────────────────────────────────

export interface ProviderSummary {
  providerId: string
  baseUrl: string
  normalizedChatCompletionsUrl: string
  model: string
  connectTimeoutSeconds: number
  readTimeoutSeconds: number
  totalTimeoutSeconds: number
  maxProseCharacters: number
  lastConnectionTestAt: string | null
  displayName: string
  kind: ProviderKind
}

// ─── 错误码 ────────────────────────────────────────────────

export enum ProviderErrorCode {
  CFG_INVALID_ENDPOINT = 'CFG_INVALID_ENDPOINT',
  AUTH_REJECTED = 'AUTH_REJECTED',
  MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
  NETWORK_OFFLINE = 'NETWORK_OFFLINE',
  PROVIDER_RATE_LIMIT = 'PROVIDER_RATE_LIMIT',
  PROVIDER_SERVER_ERROR = 'PROVIDER_SERVER_ERROR',
  REQUEST_OUTCOME_UNKNOWN = 'REQUEST_OUTCOME_UNKNOWN',
  PROSE_EMPTY = 'PROSE_EMPTY',
  PROSE_LIMIT_EXCEEDED = 'PROSE_LIMIT_EXCEEDED',
  PROSE_TRUNCATED_LENGTH = 'PROSE_TRUNCATED_LENGTH',
  PROSE_CONTENT_FILTERED = 'PROSE_CONTENT_FILTERED',
  PROSE_RESOURCE_INTERRUPTED = 'PROSE_RESOURCE_INTERRUPTED',
  PROSE_FINISH_REASON_UNKNOWN = 'PROSE_FINISH_REASON_UNKNOWN',
  SETTLEMENT_NOT_JSON = 'SETTLEMENT_NOT_JSON',
  SETTLEMENT_SCHEMA_INVALID = 'SETTLEMENT_SCHEMA_INVALID',
  STORAGE_WRITE_FAILED = 'STORAGE_WRITE_FAILED',
  USER_CANCELLED = 'USER_CANCELLED',
}

export interface ProviderFailure {
  code: ProviderErrorCode
  safeMessage: string
  userAction: string
  retryable: boolean
}

export class ProviderException extends Error {
  failure: ProviderFailure
  constructor(failure: ProviderFailure, cause?: unknown) {
    super(failure.code, { cause })
    this.failure = failure
  }
}

export function providerError(code: ProviderErrorCode): ProviderFailure {
  const messages: Record<ProviderErrorCode, [string, string, boolean]> = {
    [ProviderErrorCode.CFG_INVALID_ENDPOINT]: ['接口地址无效，请检查 HTTPS 地址。', 'EDIT_PROVIDER', false],
    [ProviderErrorCode.AUTH_REJECTED]: ['认证失败，请检查 API Key。', 'EDIT_KEY', false],
    [ProviderErrorCode.MODEL_UNAVAILABLE]: ['模型不可用，请检查模型名或接口权限。', 'EDIT_MODEL', false],
    [ProviderErrorCode.NETWORK_OFFLINE]: ['网络不可用，已保留当前进度。', 'RETRY_SAFE_STAGE', true],
    [ProviderErrorCode.PROVIDER_RATE_LIMIT]: ['接口暂时限流，请稍后重试。', 'RETRY_LATER', true],
    [ProviderErrorCode.PROVIDER_SERVER_ERROR]: ['接口暂时异常，已保留当前进度。', 'RETRY_SAFE_STAGE', true],
    [ProviderErrorCode.REQUEST_OUTCOME_UNKNOWN]: ['无法确认服务端是否已完成本次请求，请确认后再重发。', 'CONFIRM_RESEND', false],
    [ProviderErrorCode.PROSE_EMPTY]: ['本次未获得有效正文。', 'RETRY_PROSE', true],
    [ProviderErrorCode.PROSE_LIMIT_EXCEEDED]: ['正文超过安全长度，已停止接收并保留可用内容。', 'REVIEW_DRAFT', false],
    [ProviderErrorCode.PROSE_TRUNCATED_LENGTH]: ['正文达到模型输出上限，已保存为未完成草稿。', 'RETRY_PROSE', true],
    [ProviderErrorCode.PROSE_CONTENT_FILTERED]: ['Provider 已停止此内容，已保存收到的片段。', 'REVIEW_DRAFT', false],
    [ProviderErrorCode.PROSE_RESOURCE_INTERRUPTED]: ['Provider 资源中断，已保存收到的片段。', 'RETRY_PROSE', true],
    [ProviderErrorCode.PROSE_FINISH_REASON_UNKNOWN]: ['Provider 未确认正文自然结束，已保存收到的片段。', 'RETRY_PROSE', true],
    [ProviderErrorCode.SETTLEMENT_NOT_JSON]: ['正文已保存，但状态整理格式无效。', 'EXPLICIT_RETRY_SETTLEMENT', true],
    [ProviderErrorCode.SETTLEMENT_SCHEMA_INVALID]: ['正文已保存，但状态整理缺少必要信息。', 'EXPLICIT_RETRY_SETTLEMENT', true],
    [ProviderErrorCode.STORAGE_WRITE_FAILED]: ['无法安全保存，请检查存储空间。', 'FREE_SPACE_AND_RETRY', true],
    [ProviderErrorCode.USER_CANCELLED]: ['已停止生成，已保存的正文不会被删除。', 'RETRY_OR_DISCARD', true],
  }
  const [safeMessage, userAction, retryable] = messages[code]
  return { code, safeMessage, userAction, retryable }
}

// ─── 连接测试结果 ──────────────────────────────────────────

export type ConnectionTestResult =
  | { type: 'Saved'; summary: ProviderSummary; requestIdHash: string | null; durationMillis: number }
  | { type: 'Failed'; failure: ProviderFailure }

// ─── 取消结果 ──────────────────────────────────────────────

export enum CancelResult {
  CANCEL_REQUESTED = 'CANCEL_REQUESTED',
  ALREADY_REQUESTED = 'ALREADY_REQUESTED',
  NOT_ACTIVE = 'NOT_ACTIVE',
}

// ─── 请求 ID ────────────────────────────────────────────────

export const RequestIds = {
  prose(taskId: string): string { return `${taskId}:prose` },
  settlement(taskId: string): string { return `${taskId}:settlement` },
  connectionTest(providerId: string): string { return `${providerId}:connection-test` },
}

// ─── 校验 ──────────────────────────────────────────────────

export function validateProviderInput(
  input: ProviderSetupInput,
  allowHttp = false,
  allowStoredCredential = false,
): { ok: true; value: NormalizedEndpoint } | { ok: false; error: ProviderErrorCode } {
  const endpoint = normalizeEndpoint(input.baseUrl, allowHttp)
  if (!endpoint.ok) return { ok: false, error: ProviderErrorCode.CFG_INVALID_ENDPOINT }

  // API Key 校验
  const keyValid = (allowStoredCredential && input.apiKey.length === 0) ||
    (input.apiKey.length >= 8 && input.apiKey.length <= 16384 && !/\s/.test(input.apiKey))
  if (!keyValid) return { ok: false, error: ProviderErrorCode.AUTH_REJECTED }

  if (!input.model.trim() || input.model.length > 200) return { ok: false, error: ProviderErrorCode.MODEL_UNAVAILABLE }
  if (!input.displayName.trim() || input.displayName.length > 80) return { ok: false, error: ProviderErrorCode.CFG_INVALID_ENDPOINT }

  if (input.profileId && !/^provider_[A-Za-z0-9_-]{4,}$/.test(input.profileId))
    return { ok: false, error: ProviderErrorCode.CFG_INVALID_ENDPOINT }

  if (input.connectTimeoutSeconds < 5 || input.connectTimeoutSeconds > 60) return { ok: false, error: ProviderErrorCode.CFG_INVALID_ENDPOINT }
  if (input.readTimeoutSeconds < 30 || input.readTimeoutSeconds > 600) return { ok: false, error: ProviderErrorCode.CFG_INVALID_ENDPOINT }
  if (input.totalTimeoutSeconds < 60 || input.totalTimeoutSeconds > 1800) return { ok: false, error: ProviderErrorCode.CFG_INVALID_ENDPOINT }
  if (input.maxProseCharacters < 1000 || input.maxProseCharacters > 30000) return { ok: false, error: ProviderErrorCode.CFG_INVALID_ENDPOINT }

  return { ok: true, value: endpoint.value }
}

// 导出供 provider 使用的常量
export const INCOMPLETE_PROSE_CODES = new Set<ProviderErrorCode>([
  ProviderErrorCode.PROSE_LIMIT_EXCEEDED,
  ProviderErrorCode.PROSE_TRUNCATED_LENGTH,
  ProviderErrorCode.PROSE_CONTENT_FILTERED,
  ProviderErrorCode.PROSE_RESOURCE_INTERRUPTED,
  ProviderErrorCode.PROSE_FINISH_REASON_UNKNOWN,
  ProviderErrorCode.REQUEST_OUTCOME_UNKNOWN,
])
