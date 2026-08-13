/**
 * The grievance service.
 *
 * This file is the public surface and nothing else. Implementations live in
 * `commands.ts` (writes) and `queries.ts` (reads); shared schemas and helpers live in
 * `_internal.ts`.
 *
 * It stays a barrel so every existing import of `@/lib/grievance/service` keeps working.
 * It used to be a single 1021-line module holding all twenty operations, their schemas,
 * and their helpers, which meant every change to a screen's query shape touched the same
 * file as every change to the workflow.
 */
export * from './commands'
export * from './queries'
export type {
  SubmitGrievanceInput,
  FileAppealInput,
  AddAttachmentInput,
  ListGrievancesFilters,
  ListGrievancesResult,
  QueueFilters,
  BulkResult,
  TransitionResult,
  FileAppealResult,
} from './_internal'
