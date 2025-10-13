import {BaseColumnSchemaPart, EntityBaseRow} from '../../entity-base.js';
import {ValueDefinitionRow} from '../../definitions/key-value/value-definition.schema.js';
import {VcpmCkvRow} from '../subgraph/subgraph-vcpm-data.js';
import {EntitySchema} from 'typeorm';

export interface KeyVectorRow extends EntityBaseRow {
  // This is has created from list of values
  // and can be used to find instance in O(1)
  kvHash: string;

  // Relations
  values?: ValueDefinitionRow[];
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
  },
  relations: {
    values: {
      type: 'many-to-many',
      target: 'ValueDefinition',
      joinTable: {
        name: 'key_vector_values',
        joinColumn: {
          name: 'key_vector_id',
          referencedColumnName: 'systemId'
        },
        inverseJoinColumn: {
          name: 'value_definition_id',
          referencedColumnName: 'systemId'
        }
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
      name: 'ix_kv_hash',
      columns: ['kvHash'],
    },
    {
      name: 'uk_kv_hash',
      columns: ['kvHash'],
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
