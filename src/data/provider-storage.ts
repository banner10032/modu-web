/**
 * Provider 配置存储 — 从 Kotlin S1ProviderStorage.kt 翻译。
 * 用 localStorage 替代文件存储。
 */

import { type ProviderKind, type ProviderSummary } from '../core/provider-contract'

export interface StoredProviderSettings {
  providerId: string
  baseUrl: string
  normalizedChatCompletionsUrl: string
  model: string
  credentialAlias: string
  connectTimeoutSeconds: number
  readTimeoutSeconds: number
  totalTimeoutSeconds: number
  maxProseCharacters: number
  lastConnectionTestAt: string | null
  displayName: string
  kind: ProviderKind
}

const STORAGE_KEY = 'modu-provider-settings'
const MAX_PROFILES = 20

interface StoredCollection {
  schemaVersion: '2.0'
  activeProfileId: string | null
  profiles: StoredProviderSettings[]
}

export function storedToSummary(s: StoredProviderSettings): ProviderSummary {
  return {
    providerId: s.providerId,
    baseUrl: s.baseUrl,
    normalizedChatCompletionsUrl: s.normalizedChatCompletionsUrl,
    model: s.model,
    connectTimeoutSeconds: s.connectTimeoutSeconds,
    readTimeoutSeconds: s.readTimeoutSeconds,
    totalTimeoutSeconds: s.totalTimeoutSeconds,
    maxProseCharacters: s.maxProseCharacters,
    lastConnectionTestAt: s.lastConnectionTestAt,
    displayName: s.displayName,
    kind: s.kind,
  }
}

export class ProviderSettingsStore {
  load(): StoredProviderSettings | null {
    const collection = this.readCollection()
    return collection.profiles.find(p => p.providerId === collection.activeProfileId)
      ?? collection.profiles[0]
      ?? null
  }

  loadAll(): StoredProviderSettings[] {
    return this.readCollection().profiles
  }

  find(profileId: string): StoredProviderSettings | null {
    return this.readCollection().profiles.find(p => p.providerId === profileId) ?? null
  }

  save(settings: StoredProviderSettings): void {
    const current = this.readCollection()
    const profiles = [...current.profiles.filter(p => p.providerId !== settings.providerId), settings].slice(-MAX_PROFILES)
    this.writeCollection({ schemaVersion: '2.0', activeProfileId: settings.providerId, profiles })
  }

  select(profileId: string): StoredProviderSettings {
    const current = this.readCollection()
    const selected = current.profiles.find(p => p.providerId === profileId)
    if (!selected) throw new Error('PROVIDER_PROFILE_NOT_FOUND')
    this.writeCollection({ ...current, activeProfileId: profileId })
    return selected
  }

  remove(profileId: string): StoredProviderSettings {
    const current = this.readCollection()
    const removed = current.profiles.find(p => p.providerId === profileId)
    if (!removed) throw new Error('PROVIDER_PROFILE_NOT_FOUND')
    const remaining = current.profiles.filter(p => p.providerId !== profileId)
    const nextActive = current.activeProfileId !== profileId ? current.activeProfileId : remaining[0]?.providerId ?? null
    this.writeCollection({ ...current, activeProfileId: nextActive, profiles: remaining })
    return removed
  }

  private readCollection(): StoredCollection {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { schemaVersion: '2.0', activeProfileId: null, profiles: [] }
    const parsed = JSON.parse(raw) as StoredCollection
    if (parsed.schemaVersion !== '2.0') throw new Error('PROVIDER_SETTINGS_VERSION_UNSUPPORTED')
    if (parsed.profiles.length > MAX_PROFILES) throw new Error('PROVIDER_SETTINGS_TOO_MANY')
    return parsed
  }

  private writeCollection(collection: StoredCollection): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collection))
  }
}
