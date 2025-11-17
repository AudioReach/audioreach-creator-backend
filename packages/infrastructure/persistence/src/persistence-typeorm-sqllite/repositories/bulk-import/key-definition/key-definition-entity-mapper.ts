import {KeyDefinition, ValueDefinition} from '@arc/core';
import {
  KeyDefinitionRow,
  ValueDefinitionRow,
} from '../../../entity-schema/index.js';
import {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';

/**
 * Map KeyDefinition domain entity to database row.
 * Omits systemId (DB generates it).
 */
export function toKeyRow(
  key: Omit<KeyDefinition, 'systemId'>,
): QueryDeepPartialEntity<KeyDefinitionRow> {
  return {
    keyId: key.keyId,
    keyName: key.name,
    description: key.description || undefined,
    cEnumMemberName: key.cHeaderAttributes?.keyEnumName || undefined,
    cEnumName: key.cHeaderAttributes?.keyEnumValue || undefined,
  };
}

/**
 * Map ValueDefinition domain entity to database row.
 * Omits systemId (DB generates it).
 *
 * @param value - ValueDefinition domain entity
 * @param keySystemId - Parent key's systemId (FK)
 */
export function toValueRow(
  value: Omit<ValueDefinition, 'systemId'>,
  keySystemId: number,
): QueryDeepPartialEntity<ValueDefinitionRow> {
  return {
    keySystemId,
    valueId: value.valueId,
    valueName: value.name,
    description: value.description || undefined,
    cEnumMemberName: value.enumValue || undefined,
  };
}
