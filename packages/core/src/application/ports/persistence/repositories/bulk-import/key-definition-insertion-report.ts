import type {NaturalIdMapping, InsertError} from './insert-result.js';

/**
 * Key definition error entity types.
 */
export const KEY_DEF_AGGREGATE_ENTITY_TYPES = {
  KEY_DEFINITION: 'KEY_DEFINITION',
  VALUE_DEFINITION: 'VALUE_DEFINITION',
} as const;

export type KeyDefinitionInsertErrorEntity =
  (typeof KEY_DEF_AGGREGATE_ENTITY_TYPES)[keyof typeof KEY_DEF_AGGREGATE_ENTITY_TYPES];

export type KeyDefinitionInsertError =
  InsertError<KeyDefinitionInsertErrorEntity>;

/**
 * Key definition insert result.
 * Returns value definition mappings for calibration workflows.
 *
 * @example
 * ```typescript
 * const result: KeyDefinitionInsertResult = {
 *   keyDefinitionIdMapping: { naturalId: 789, systemId: 101 },
 *   childMappings: {
 *     valueDefinitions: [
 *       { naturalId: 'default', systemId: 201 },
 *       { naturalId: 'high', systemId: 202 }
 *     ]
 *   },
 *   errors: [],
 *   success: true
 * };
 * ```
 */
export interface KeyDefinitionInsertResult {
  /** Key definition root: keyId → systemId */
  keyDefinitionIdMapping?: NaturalIdMapping<number>;
  /** Value definition mappings needed for calibration workflows */
  childMappings: {
    valueDefinitions: NaturalIdMapping<number>[];
  };
  errors: KeyDefinitionInsertError[];
  success: boolean;
}

export interface BulkKeyDefinitionInsertResult {
  results: KeyDefinitionInsertResult[];
}
