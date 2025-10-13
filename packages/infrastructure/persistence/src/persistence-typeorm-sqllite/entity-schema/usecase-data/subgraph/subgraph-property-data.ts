import {SubgraphPropertyRow} from '../../definitions/subgraph/subgraph-property-definition.schema.js';
import {BaseColumnSchemaPart, EntityBaseRow} from '../../entity-base.js';
import {SubgraphRow} from './subgraph.schema.js';
import {BlobBytesConverter} from '../module/helper/blob-unit8array.converter.js';
import {DbTypeToBytesTransformer} from '../module/helper/bytes-transformer.js';
import {EntitySchema} from 'typeorm';

export interface SubgraphPropertyDataRow extends EntityBaseRow {
  subgraphSystemId: number;
  subgraphPropertySystemId: number;
  payload: Uint8Array;

  subgraph?: SubgraphRow;
  subgraphPropertyDefinition: SubgraphPropertyRow;
}

export const SubgraphPropertyDataSchema = (blobConverter: BlobBytesConverter) =>
  new EntitySchema<SubgraphPropertyDataRow>({
    name: 'SubgraphPropertyData',
    tableName: 'subgraph_property_data',
    columns: {
      ...BaseColumnSchemaPart,
      subgraphSystemId: {
        name: 'subgraph_system_id',
        type: 'integer',
      },
      subgraphPropertySystemId: {
        name: 'subgraph_property_system_id',
        type: 'integer',
      },
      payload: {
        type: 'blob',
        transformer: DbTypeToBytesTransformer(blobConverter),
      },
    },
    relations: {
      subgraph: {
        type: 'many-to-one',
        target: 'Subgraph',
        joinColumn: {
          name: 'subgraph_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
      subgraphPropertyDefinition: {
        type: 'many-to-one',
        target: 'SubgraphProperty',
        joinColumn: {
          name: 'subgraph_property_system_id',
          referencedColumnName: 'systemId',
        },
        onDelete: 'CASCADE',
      },
    },
    indices: [
      {
        name: 'uk_subgraph_property_data',
        columns: ['subgraphSystemId', 'subgraphPropertySystemId'],
        unique: true,
      },
    ],
  });
