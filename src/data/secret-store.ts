/**
 * API Key 加密存储 — 用 Web Crypto AES-GCM 替代 AndroidKeyStore。
 * 加密密钥由设备唯一 passphrase 派生（首次运行生成随机密钥存入 localStorage）。
 */

import { randomId, toBase64, fromBase64 } from './crypto'

const ALIAS_PATTERN = /^novel_api_key_[A-Za-z0-9_-]+$/
const KEY_STORAGE_KEY = 'modu-master-key'
const SALT_STORAGE_KEY = 'modu-master-salt'

let cachedCryptoKey: CryptoKey | null = null

async function getMasterKey(): Promise<CryptoKey> {
  if (cachedCryptoKey) return cachedCryptoKey
  let rawKey = localStorage.getItem(KEY_STORAGE_KEY)
  let salt = localStorage.getItem(SALT_STORAGE_KEY)
  if (!rawKey || !salt) {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32))
    const saltBytes = crypto.getRandomValues(new Uint8Array(16))
    rawKey = toBase64(keyBytes)
    salt = toBase64(saltBytes)
    localStorage.setItem(KEY_STORAGE_KEY, rawKey)
    localStorage.setItem(SALT_STORAGE_KEY, salt)
  }
  cachedCryptoKey = await crypto.subtle.importKey(
    'raw', fromBase64(rawKey) as unknown as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  )
  return cachedCryptoKey
}

interface EncryptedCredential {
  schemaVersion: '1.0'
  credentialAlias: string
  iv: string
  ciphertext: string
}

export class WebSecretStore {
  async save(secret: string): Promise<string> {
    if (secret.length < 8 || secret.length > 16384) throw new Error('SECRET_LENGTH_INVALID')
    const alias = `novel_api_key_${randomId('', 32)}`
    const key = await getMasterKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(secret)
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, encoded as unknown as BufferSource)
    const record: EncryptedCredential = {
      schemaVersion: '1.0',
      credentialAlias: alias,
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
    }
    localStorage.setItem(alias, JSON.stringify(record))
    return alias
  }

  async withSecret<T>(credentialAlias: string, block: (secret: string) => T | Promise<T>): Promise<T> {
    if (!ALIAS_PATTERN.test(credentialAlias)) throw new Error('PROVIDER_CREDENTIAL_UNAVAILABLE')
    const stored = localStorage.getItem(credentialAlias)
    if (!stored) throw new Error('PROVIDER_CREDENTIAL_UNAVAILABLE')
    const record = JSON.parse(stored) as EncryptedCredential
    if (record.schemaVersion !== '1.0' || record.credentialAlias !== credentialAlias) {
      throw new Error('PROVIDER_CREDENTIAL_UNAVAILABLE')
    }
    const key = await getMasterKey()
    const iv = fromBase64(record.iv)
    const ciphertext = fromBase64(record.ciphertext)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, ciphertext as unknown as BufferSource)
    const secret = new TextDecoder().decode(plaintext)
    return block(secret)
  }

  async delete(credentialAlias: string): Promise<void> {
    if (!ALIAS_PATTERN.test(credentialAlias)) return
    localStorage.removeItem(credentialAlias)
  }
}
