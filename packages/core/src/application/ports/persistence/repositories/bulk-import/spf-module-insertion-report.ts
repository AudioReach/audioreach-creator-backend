import type {NaturalIdMapping, InsertError} from '../../insert-result.js';

/**
 * Module instance error entity types.
 */
export const MODULE_AGGREGATE_ENTITY_TYPES = {
  MODULE: 'MODULE',
  DATA_PORT: 'DATA_PORT',
  CONTROL_PORT: 'CONTROL_PORT',
  CKV: 'CKV',
  TAG: 'TAG',
  TKV: 'TKV',
  PARAM_PAYLOAD: 'PARAM_PAYLOAD',
} as const;

export type ModuleInsertErrorEntity =
  (typeof MODULE_AGGREGATE_ENTITY_TYPES)[keyof typeof MODULE_AGGREGATE_ENTITY_TYPES];

export type ModuleInsertError = InsertError<ModuleInsertErrorEntity>;

/**
 * Module instance insert result.
 * Success depends only on main module table insert.
 * Child failures are informational and do not cause rollback.
 *
 * @example
 * ```typescript
 * const result: ModuleInsertResult = {
 *   moduleIdMapping: { naturalId: 123, systemId: 456 },
 *   portMappings: {
 *     dataPorts: [{ naturalId: 'output_1', systemId: 789 }],
 *     controlPorts: [{ naturalId: 'ctrl_1', systemId: 790 }]
 *   },
 *   errors: [
 *     {
 *       systemId: 456,
 *       entity: MODULE_AGGREGATE_ENTITY_TYPES.CKV,
 *       naturalId: 'gain',
 *       code: 'VALIDATION_FAILED',
 *       message: 'Gain value out of range'
 *     }
 *   ],
 *   success: true
 * };
 * ```
 */
export interface ModuleInsertResult {
  /** Module root: instanceId → systemId */
  moduleIdMapping?: NaturalIdMapping<number>;
  /** Port mappings needed for creating links */
  portMappings: {
    dataPorts: NaturalIdMapping<number>[];
    controlPorts: NaturalIdMapping<number>[];
  };
  /** Child failures (no rollback) */
  errors: ModuleInsertError[];
  /** Success = moduleIdMapping exists */
  success: boolean;
}

export interface BulkModuleInsertResult {
  results: ModuleInsertResult[];
}
