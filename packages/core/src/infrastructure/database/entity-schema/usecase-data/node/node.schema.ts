import {EntitySchema} from 'typeorm';
import {DataPortRow} from './data-port-info.schema';
import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {ArcDbFileRow} from '@infrastructure/database/entity-schema/project-data/arc-db-file.schema';
import {ControlPortRow} from '@infrastructure/database/entity-schema/usecase-data/node/control-port';
import {DataLinkRow} from '@infrastructure/database/entity-schema/usecase-data/Links/data-link';
import {UseCaseRow} from '@infrastructure/database/entity-schema/usecase-data/use-case';

export const NodeType = {
  Module: 'module',
  Subsystem: 'subsystem',
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export interface NodeRow extends EntityBaseRow {
  parentId?: number;
  type: NodeType;
  fileSystemId: number;

  // Relations
  dataPorts?: DataPortRow[];
  controlPorts?: ControlPortRow[];
  file?: ArcDbFileRow;
  useCases?: UseCaseRow[];

  // DataLink relations - separate for source and destination
  sourceDataLinks?: DataLinkRow[];
  destinationDataLinks?: DataLinkRow[];
}

export const NodeSchema = new EntitySchema<NodeRow>({
  name: 'Node',
  tableName: 'nodes',
  type: 'entity-child', // For inheritance
  columns: {
    ...BaseColumnSchemaPart,
    parentId: {
      type: 'integer',
      nullable: true,
      name: 'parent_id',
    },

    type: {
      type: 'simple-enum', // SQLite
      enum: Object.values(NodeType), // ['module','subsystem']
    },

    fileSystemId: {
      type: 'integer',
      name: 'file_system_id',
    },
  },
  relations: {
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete file => delete modules
    },
    dataPorts: {
      type: 'one-to-many',
      target: 'DataPortRow',
      inverseSide: 'node',
      cascade: true,
    },
    controlPorts: {
      type: 'one-to-many',
      target: 'ControlPortRow',
      inverseSide: 'node',
      cascade: true,
    },
    sourceDataLinks: {
      type: 'one-to-many',
      target: 'DataLink',
      inverseSide: 'sourceNode',
    },
    destinationDataLinks: {
      type: 'one-to-many',
      target: 'DataLink',
      inverseSide: 'destinationNode',
    },
    useCases: {
      type: 'many-to-many',
      target: 'UseCase',
      inverseSide: 'nodes',
    },
  },
});
