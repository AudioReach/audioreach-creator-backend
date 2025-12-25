import {EntitySchema} from 'typeorm';
import type {DataPortRow} from './data-port-info.schema.js';
import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import type {ControlPortRow} from './control-port.js';
import type {DataLinkRow} from '../Links/data-link.js';
import type {UseCaseRow} from '../use-case.js';
import type {SpfModuleRow} from '../module/spf-module.schema.js';
import type {SubsystemRow} from '../subsystem/subsystem.js';

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

  // one-to-one relation to SpfModule
  spfModule?: SpfModuleRow;

  // one-to-one relation to Subsystem
  subsystem?: SubsystemRow;
}

export const NodeSchema = new EntitySchema<NodeRow>({
  name: 'Node',
  tableName: 'nodes',
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
      target: 'DataPort',
      inverseSide: 'node',
      cascade: true,
    },
    controlPorts: {
      type: 'one-to-many',
      target: 'ControlPort',
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
    spfModule: {
      type: 'one-to-one',
      target: 'SpfModule',
      inverseSide: 'node', // References the 'node' property in SpfModule
    },
    subsystem: {
      type: 'one-to-one',
      target: 'Subsystem',
      inverseSide: 'node', // References the 'node' property in Subsystem
    },
  },
});
