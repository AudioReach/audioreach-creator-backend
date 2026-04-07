import type {BaseInsertError} from './base-insert-error.interface.js';

export const HierarchicalInsertStatus = {
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  PARTIAL_FAILURE: 'PARTIAL_FAILURE',
} as const;

export type HierarchicalInsertStatusValue =
  (typeof HierarchicalInsertStatus)[keyof typeof HierarchicalInsertStatus];
// "SUCCESS" | "SUCCESS" | "SUCCESS"
export abstract class BaseHierarchicalEntityResult<
  TError extends BaseInsertError,
> {
  abstract get errors(): TError[];
  abstract get status(): HierarchicalInsertStatusValue;

  get errorCount(): number {
    return this.errors.length;
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  abstract getAllChildren(): BaseHierarchicalEntityResult<TError>[];
}
