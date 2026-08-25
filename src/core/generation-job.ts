/**
 * 生成任务与恢复审计 — 从 Kotlin S3GenerationJob.kt 翻译。
 */

import type { NovelRepository } from './domain'
import { ChapterState } from './domain'

export enum JobPurpose {
  PROSE = 'PROSE',
  SETTLEMENT = 'SETTLEMENT',
  SETTLEMENT_REPAIR = 'SETTLEMENT_REPAIR',
  BOOTSTRAP = 'BOOTSTRAP',
  PLAN_REFRESH = 'PLAN_REFRESH',
}

export enum JobStage {
  PREPARE = 'PREPARE',
  PROSE_REQUEST = 'PROSE_REQUEST',
  PROSE_SAVED = 'PROSE_SAVED',
  SETTLEMENT_REQUEST = 'SETTLEMENT_REQUEST',
  VALIDATE = 'VALIDATE',
  COMMIT = 'COMMIT',
  DONE = 'DONE',
}

export interface GenerationJob {
  jobId: string
  projectId: string
  chapter: number
  purpose: JobPurpose
  stage: JobStage
  createdAt: string
  updatedAt: string
  attempt: number
  promptTemplateId: string
  requestId: string | null
  taskId: string | null
  commitId: string | null
  draftPath: string | null
  lastErrorCode: string | null
  outcomeKnown: boolean
  providerProfileId: string | null
}

export interface JobStore {
  load(projectId: string): Promise<GenerationJob | null>
  save(job: GenerationJob): Promise<void>
  clear(projectId: string): Promise<void>
}

export enum RecoveryAction {
  NONE = 'NONE',
  RETRY_PROSE = 'RETRY_PROSE',
  RETRY_SETTLEMENT = 'RETRY_SETTLEMENT',
  CONFIRM_RESEND = 'CONFIRM_RESEND',
  REVIEW_DRAFT = 'REVIEW_DRAFT',
}

export interface RecoveryDecision {
  action: RecoveryAction
  job: GenerationJob | null
  recoveredCommitIds: string[]
}

const MAX_SETTLEMENT_ATTEMPTS = 3

export class RecoveryAuditor {
  constructor(
    private repository: NovelRepository,
    private jobStore: JobStore,
  ) {}

  async audit(projectId: string): Promise<RecoveryDecision> {
    const recovered = await this.repository.recoverPendingCommits()
    const job = await this.jobStore.load(projectId)
    if (!job) return { action: RecoveryAction.NONE, job: null, recoveredCommitIds: recovered }

    const snapshot = await this.repository.loadProject(projectId)
    if (!snapshot) return { action: RecoveryAction.CONFIRM_RESEND, job, recoveredCommitIds: recovered }

    const chapter = snapshot.chapters.find(c => c.number === job.chapter)
    if (chapter?.state === ChapterState.COMMITTED || job.stage === JobStage.DONE) {
      await this.jobStore.clear(projectId)
      return { action: RecoveryAction.NONE, job: null, recoveredCommitIds: recovered }
    }
    if (chapter?.state === ChapterState.READABLE_DRAFT || chapter?.state === ChapterState.NEEDS_REVIEW) {
      const settlementRetriesExhausted = job.attempt >= MAX_SETTLEMENT_ATTEMPTS &&
        (job.lastErrorCode?.includes('SETTLEMENT') ?? false)
      return {
        action: settlementRetriesExhausted ? RecoveryAction.REVIEW_DRAFT : RecoveryAction.RETRY_SETTLEMENT,
        job,
        recoveredCommitIds: recovered,
      }
    }
    if (chapter?.state === ChapterState.PAUSED) {
      return { action: RecoveryAction.RETRY_PROSE, job, recoveredCommitIds: recovered }
    }
    if (!job.outcomeKnown && (job.stage === JobStage.PROSE_REQUEST || job.stage === JobStage.SETTLEMENT_REQUEST)) {
      return { action: RecoveryAction.CONFIRM_RESEND, job, recoveredCommitIds: recovered }
    }
    return {
      action: job.stage === JobStage.PROSE_SAVED ? RecoveryAction.REVIEW_DRAFT : RecoveryAction.RETRY_PROSE,
      job,
      recoveredCommitIds: recovered,
    }
  }
}
