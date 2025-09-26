import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {ValueDefinitionRow} from '@infrastructure/database/entity-schema/definitions/key-value/value-definition.schema';
import {VcpmCkvRow} from '@infrastructure/database/entity-schema/usecase-data/subgraph/subgraph-vcpm-data';
import {EntitySchema} from 'typeorm';

export interface KeyVectorRow extends EntityBaseRow {
  // This is has created from list of values
  // and can be used to find instance in O(1)
  kvHash: string;

  valueSystemId: number;

  // Relations
  value?: ValueDefinitionRow;
  vcpmCkvs?: VcpmCkvRow[];
}

export const KeyVectorSchema = new EntitySchema<KeyVectorRow>({
  name: 'KeyVector',
  tableName: 'key_vectors',
  columns: {
    ...BaseColumnSchemaPart,
    kvHash: {
      name: 'kv_hash',
      type: 'varchar',
      length: 64,
      nullable: false,
    },
    valueSystemId: {
      name: 'value_system_id',
      type: 'integer',
      nullable: false,
    },
  },
  relations: {
    value: {
      type: 'many-to-one',
      target: 'ValueDefinition',
      joinColumn: {
        name: 'value_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT', // Do not delete a value if key-vectors are present
    },
    vcpmCkvs: {
      type: 'one-to-many',
      target: 'VcpmCkv',
      inverseSide: 'keyVector',
    },
  },
  indices: [
    {
      name: 'ix_kvv_hash',
      columns: ['kvvHash'],
    },
    {
      name: 'uk_kvv_hash_value',
      columns: ['kvvHash', 'valueSystemId'],
      unique: true,
    },
  ],
});

import {createHash} from 'crypto';
export class KvHashGenerator {
  /**
   * Generate deterministic SHA-256 hash from value system IDs
   * @param valueSystemIds Array of value system IDs
   * @returns SHA-256 hash string (64 characters)
   */
  static generateHash(valueSystemIds: number[]): string {
    // Sort to ensure same combination always produces same hash
    const sortedIds = [...valueSystemIds].sort((a, b) => a - b);

    // Create hash input string
    const hashInput = sortedIds.join(',');

    // Generate SHA-256 hash
    return createHash('sha256').update(hashInput).digest('hex');
  }
}
