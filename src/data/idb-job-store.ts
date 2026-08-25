/**
 * IndexedDB 生成任务存储 — 从 Kotlin FileS3GenerationJobStore.kt 翻译。
 */

import type { GenerationJob, JobStore } from '../core/generation-job'
import { JobPurpose, JobStage } from '../core/generation-job'

const JOB_ID_PATTERN = /^job_[A-Za-z0-9_-]{10,}$/
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const DRAFT_PATH_PATTERN = /^chapters\/[0-9]{6}\.md$/

export class IdbJobStore implements JobStore {
  async load(projectId: string): Promise<GenerationJob | null> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const txn = db.transaction('jobs', 'readonly')
      const req = txn.objectStore('jobs').get(projectId)
      req.onsuccess = () => {
        const job = req.result as GenerationJob | undefined
        if (!job) { resolve(null); return }
        try {
          if (!JOB_ID_PATTERN.test(job.jobId)) throw new Error('JOB_ID_INVALID')
          if (job.chapter < 0) throw new Error('CHAPTER_INVALID')
          if (job.attempt < 1 || job.attempt > 3) throw new Error('ATTEMPT_INVALID')
          if (job.draftPath && !DRAFT_PATH_PATTERN.test(job.draftPath)) throw new Error('DRAFT_PATH_INVALID')
          resolve(job)
        } catch (e) {
          reject(new Error(`ACTIVE_JOB_CORRUPT:${(e as Error).message}`))
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  async save(job: GenerationJob): Promise<void> {
    if (!JOB_ID_PATTERN.test(job.jobId)) throw new Error('JOB_ID_INVALID')
    if (!PROJECT_ID_PATTERN.test(job.projectId)) throw new Error('PROJECT_ID_INVALID')
    if (job.chapter < 0) throw new Error('CHAPTER_INVALID')
    if (job.attempt < 1 || job.attempt > 3) throw new Error('ATTEMPT_INVALID')
    if (job.draftPath && !DRAFT_PATH_PATTERN.test(job.draftPath)) throw new Error('DRAFT_PATH_INVALID')

    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const txn = db.transaction('jobs', 'readwrite')
      txn.objectStore('jobs').put(job)
      txn.oncomplete = () => resolve()
      txn.onerror = () => reject(txn.error)
    })
  }

  async clear(projectId: string): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const txn = db.transaction('jobs', 'readwrite')
      txn.objectStore('jobs').delete(projectId)
      txn.oncomplete = () => resolve()
      txn.onerror = () => reject(txn.error)
    })
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('modu', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('jobs')) {
          db.createObjectStore('jobs', { keyPath: 'projectId' })
        }
      }
    })
  }
}
