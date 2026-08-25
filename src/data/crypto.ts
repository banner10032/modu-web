/**
 * SHA-256 等加密工具 — 浏览器 Web Crypto API 实现。
 */

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function randomId(prefix: string, length = 16): string {
  const hex = '0123456789abcdef'
  let id = ''
  for (let i = 0; i < length; i++) id += hex[Math.floor(Math.random() * 16)]
  return `${prefix}${id}`
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function fromBase64(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
