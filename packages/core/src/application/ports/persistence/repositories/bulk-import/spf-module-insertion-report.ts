import type {NaturalIdMapping, InsertError} from './insert-result.js';
import type {PortIoType} from '../../../../../domain/entities/common/enums/port-io-type.js';

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
 * Data port mapping with port type information for link creation.
 */
export interface DataPortMapping {
  /** Natural identifier of the data port */
  naturalId: number;
  /** Generated system ID of the data port */
  systemId: number;
  /** Port I/O type (INPUT or OUTPUT) */
  portIoType: PortIoType;
}

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
 *     dataPorts: [
 *       { naturalId: 1, systemId: 789, portIoType: 'INPUT' },
 *       { naturalId: 2, systemId: 790, portIoType: 'OUTPUT' }
 *     ],
 *     controlPorts: [{ naturalId: 3, systemId: 791 }]
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
    dataPorts: DataPortMapping[];
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
