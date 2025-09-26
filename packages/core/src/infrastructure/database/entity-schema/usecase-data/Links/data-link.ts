import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {NodeRow} from '@infrastructure/database/entity-schema/usecase-data/node/node.schema';
import {DataPortRow} from '@infrastructure/database/entity-schema/usecase-data/node/data-port-info.schema';
import {UseCaseRow} from '@infrastructure/database/entity-schema/usecase-data/use-case';
import {EntitySchema} from 'typeorm';

export interface DataLinkRow extends EntityBaseRow {
  sourceNodeSystemId: number;
  destinationNodeSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
  isInterGraph: boolean;

  sourceNode?: NodeRow;
  destinationNode?: NodeRow;
  sourcePort?: DataPortRow;
  destinationPort?: DataPortRow;
  useCases?: UseCaseRow[];
}

export const DataLinkSchema = new EntitySchema<DataLinkRow>({
  name: 'DataLink',
  tableName: 'data_links',
  columns: {
    ...BaseColumnSchemaPart,
    sourceNodeSystemId: {
      type: 'integer',
      name: 'source_node_system_id',
    },
    destinationNodeSystemId: {
      type: 'integer',
      name: 'destination_node_system_id',
    },
    sourcePortSystemId: {
      type: 'integer',
      name: 'source_port_system_id',
    },
    destinationPortSystemId: {
      type: 'integer',
      name: 'destination_port_system_id',
    },
    isInterGraph: {
      type: 'boolean',
      name: 'is_inter_graph',
    },
  },
  relations: {
    sourceNode: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'source_node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    destinationNode: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'destination_node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    sourcePort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'source_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    destinationPort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'destination_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    useCases: {
      type: 'many-to-many',
      target: 'UseCase',
      inverseSide: 'dataLinks',
    },
  },
  indices: [
    {
      name: 'uk_data_link_unique',
      columns: [
        'sourceNodeSystemId',
        'sourcePortSystemId',
        'destinationNodeSystemId',
        'destinationPortSystemId',
      ],
      unique: true,
    },
  ],
});
