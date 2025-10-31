import type {EntityType} from './systemId-reservation-service.port.js';
/**
 * Per-row insert failure diagnostics captured during batch execution.
 */
export interface InsertFailure {
  table: EntityType;
  systemId?: number;
  errorCode: string;
  message: string;
  offendingFields?: Record<string, unknown>;
  fkRefs?: Record<string, number>;
}

/**
 * Outcome of a insert phase, summarized by table.
 */
export interface InsertionReport {
  summaryByTable: Record<
    EntityType,
    {
      attempted: number;
      succeeded: number;
      failed: number;
    }
  >;
  failures: InsertFailure[];
}
