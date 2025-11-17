import {InsertError} from '@arc/core';
import {EntityManager} from 'typeorm';
/**
 * Abstract base class for all entity inserters.
 * Provides common error handling and utilities.
 *
 * @template TDomain - Domain entity type
 * @template TResult - Insert result type
 * @template TErrorEntity - Error entity type (constrained to specific union types)
 */
export abstract class BaseInserter<
  TDomain,
  TResult,
  TErrorEntity extends string = string,
> {
  protected manager: EntityManager;
  constructor(manager: EntityManager) {
    this.manager = manager;
  }

  /**
   * Insert entities and return result with natural key mappings.
   */
  abstract insert(items: TDomain[]): Promise<TResult>;

  /**
   * Build domain-oriented error from exception.
   */
  protected buildError(
    entity: TErrorEntity,
    naturalId: string | number,
    error: Error,
  ): InsertError<TErrorEntity> {
    return {
      entity,
      naturalId: String(naturalId),
      code: this.classifyError(error),
      message: error.message,
      causes: this.extractCauses(error),
    };
  }

  /**
   * Classify error into domain error codes.
   */
  protected classifyError(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('unique constraint') || message.includes('unique')) {
      return 'UNIQUE_CONSTRAINT';
    }
    if (message.includes('foreign key') || message.includes('fk')) {
      return 'FK_VIOLATION';
    }
    if (message.includes('not null') || message.includes('null')) {
      return 'NULL_CONSTRAINT';
    }
    if (message.includes('check constraint')) {
      return 'CHECK_CONSTRAINT';
    }

    return 'INSERT_FAILED';
  }

  /**
   * Extract nested error causes if available.
   */
  protected extractCauses(
    error: Error,
  ): Array<{code: string; message: string}> {
    const causes: Array<{code: string; message: string}> = [];

    // Check if error has a cause property (some ORMs provide this)
    if ('cause' in error && error.cause instanceof Error) {
      causes.push({
        code: this.classifyError(error.cause),
        message: error.cause.message,
      });
    }

    return causes;
  }
}
