/**
 * 项目归档导入导出 — 从 Kotlin S4ProjectArchive.kt 翻译。
 * 用 JSZip 逻辑手动实现（不引入额外依赖，用 Blob + 结构化 JSON）。
 * 导出为 .modu.json（包含 manifest + 所有文件内容）。
 */

import type { IdbNovelRepository } from './idb-repository'
import { sha256Bytes } from './crypto'

interface ArchiveEntry {
  path: string
  bytes: Uint8Array
  sha256: string
}

export interface ArchiveResult {
  projectId: string
  fileCount: number
  totalBytes: number
  contentSha256: string
}

const MANIFEST_PATH = 'modu-export-manifest.json'
const REQUIRED_PATHS = new Set(['project.json', 'state.json', 'plan.json'])

class ArchiveError extends Error {
  constructor(message: string) { super(message); this.name = 'ArchiveError' }
}

export class ProjectArchive {
  constructor(private repository: IdbNovelRepository) {}

  async export(projectId: string): Promise<{ blob: Blob; result: ArchiveResult }> {
    const data = await this.repository.exportProjectData(projectId)
    if (!data) throw new ArchiveError('PROJECT_NOT_FOUND')

    const files = new Map<string, string>()
    files.set('project.json', JSON.stringify({
      schemaVersion: '1.2',
      id: data.project.id,
      title: data.project.title,
      genre: data.project.genre,
      protagonist: data.project.protagonist,
      tone: data.project.tone,
      premise: data.project.premise,
      contentScale: data.project.contentScale,
      plotPace: data.project.plotPace,
      createdAt: data.project.createdAt,
    }))
    files.set('state.json', JSON.stringify({
      schemaVersion: '1.0',
      revision: data.storyState.revision,
      nextChapter: data.storyState.nextChapter,
      committedChapters: data.storyState.committedChapters,
      recentEventKeys: data.storyState.recentEventKeys,
    }))
    files.set('plan.json', JSON.stringify({
      schemaVersion: '1.0',
      items: data.plan,
    }))

    for (const chapter of data.chapters) {
      const chapterNum = chapter.number.toString().padStart(6, '0')
      files.set(`chapters/${chapterNum}.md`, chapter.prose)
      files.set(`chapters/${chapterNum}.meta.json`, JSON.stringify({
        schemaVersion: '1.0',
        number: chapter.number,
        title: chapter.title,
        taskId: chapter.taskId,
        state: chapter.state,
        summary: chapter.summary,
        commitId: chapter.commitId,
        incompleteReason: chapter.incompleteReason,
        updatedAt: chapter.updatedAt,
      }))
    }

    const manifest = {
      schemaVersion: '1.0',
      exportFormat: 'long-novel-project-zip',
      projectId,
      title: data.project.title,
      exportedAt: new Date().toISOString(),
      sourceRevision: data.storyState.revision,
      files: [...files.keys()].map(path => ({
        path,
        size: new TextEncoder().encode(files.get(path)!).length,
        sha256: '', // 填充下方
      })),
    }

    // 计算 sha256
    const entries: ArchiveEntry[] = []
    for (const [path, content] of files) {
      const bytes = new TextEncoder().encode(content)
      entries.push({ path, bytes, sha256: await sha256Bytes(bytes) })
    }
    manifest.files = entries.map(e => ({ path: e.path, size: e.bytes.length, sha256: e.sha256 }))

    const totalBytes = entries.reduce((sum, e) => sum + e.bytes.length, 0)
    const contentSha256 = await this.aggregateSha256(entries)

    // 导出为 JSON（包含 manifest + 所有文件）
    const exportData = {
      manifest,
      files: Object.fromEntries(entries.map(e => [e.path, new TextDecoder().decode(e.bytes)])),
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })

    return {
      blob,
      result: { projectId, fileCount: entries.length, totalBytes, contentSha256 },
    }
  }

  async import(file: File): Promise<ArchiveResult> {
    const text = await file.text()
    let parsed: { manifest: Record<string, unknown>; files: Record<string, string> }
    try { parsed = JSON.parse(text) } catch { throw new ArchiveError('IMPORT_MANIFEST_INVALID') }

    const manifest = parsed.manifest
    if (!manifest) throw new ArchiveError('IMPORT_MANIFEST_MISSING')
    if (manifest['schemaVersion'] !== '1.0') throw new ArchiveError('IMPORT_MANIFEST_VERSION')
    if (manifest['exportFormat'] !== 'long-novel-project-zip') throw new ArchiveError('IMPORT_FORMAT')

    const sourceProjectId = manifest['projectId'] as string
    if (!/^[A-Za-z0-9_-]+$/.test(sourceProjectId)) throw new ArchiveError('IMPORT_PROJECT_ID')
    if (typeof manifest['title'] !== 'string' || manifest['title'].length < 1 || manifest['title'].length > 100) throw new ArchiveError('IMPORT_TITLE')

    const declaredFiles = manifest['files'] as { path: string; size: number; sha256: string }[]
    if (!declaredFiles || declaredFiles.length < REQUIRED_PATHS.size) throw new ArchiveError('IMPORT_MANIFEST_FILE_COUNT')

    // 校验每个文件
    for (const declared of declaredFiles) {
      const content = parsed.files[declared.path]
      if (content === undefined) throw new ArchiveError(`IMPORT_MANIFEST_FILE_MISSING:${declared.path}`)
      const bytes = new TextEncoder().encode(content)
      if (bytes.length !== declared.size) throw new ArchiveError(`IMPORT_SIZE_MISMATCH:${declared.path}`)
      const hash = await sha256Bytes(bytes)
      if (hash !== declared.sha256) throw new ArchiveError(`IMPORT_HASH_MISMATCH:${declared.path}`)
    }

    // 导入项目数据
    const projectJson = JSON.parse(parsed.files['project.json'])
    const stateJson = JSON.parse(parsed.files['state.json'])
    const planJson = JSON.parse(parsed.files['plan.json'])

    // 找可用 ID
    const existing = await this.repository.loadProject(sourceProjectId)
    const targetProjectId = existing ? `${sourceProjectId}_import_${Date.now()}` : sourceProjectId

    // 创建项目
    await this.repository.createProject(
      { ...projectJson, id: targetProjectId },
      planJson.items,
    )

    // 直接写入状态和章节（需要绕过正常流程，因为导入的是已完成项目）
    // 这里简化：创建后手动恢复状态
    // 实际完整实现需要 repository 支持直接写入 state

    const contentSha256 = await this.aggregateSha256(
      declaredFiles.map(f => ({ path: f.path, bytes: new TextEncoder().encode(parsed.files[f.path]), sha256: f.sha256 }))
    )

    return { projectId: targetProjectId, fileCount: declaredFiles.length, totalBytes: declaredFiles.reduce((s, f) => s + f.size, 0), contentSha256 }
  }

  private async aggregateSha256(entries: ArchiveEntry[]): Promise<string> {
    const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path))
    const parts: string[] = []
    for (const entry of sorted) {
      parts.push(entry.path)
      parts.push(entry.sha256)
    }
    return sha256Bytes(new TextEncoder().encode(parts.join('\0')))
  }
}
