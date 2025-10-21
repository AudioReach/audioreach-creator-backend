import {BaseColumnSchemaPart, EntityBaseRow} from '../entity-base.js';
import {ArcDbFileRow} from '../project-data/arc-db-file.schema.js';
import {NodeRow} from './node/node.schema.js';
import {DataLinkRow} from './Links/data-link.js';
import {ControlLinkRow} from './Links/control-link.js';
import {KeyVectorRow} from './common/key-vector-schema.js';
import {EntitySchema} from 'typeorm';

export interface UseCaseRow extends EntityBaseRow {
  aliasId: number;
  alias: string;
  fileSystemId: number;

  // Relations
  file?: ArcDbFileRow;
  categories?: UseCaseCategoryRow[];
  nodes?: NodeRow[];
  dataLinks?: DataLinkRow[];
  controlLinks?: ControlLinkRow[];
  keyVector?: KeyVectorRow;
}

export interface UseCaseCategoryRow extends EntityBaseRow {
  name: string;

  // Relations
  useCases?: UseCaseRow[];
}

export const UseCaseSchema = new EntitySchema<UseCaseRow>({
  name: 'UseCase',
  tableName: 'use_cases',
  columns: {
    ...BaseColumnSchemaPart,
    aliasId: {
      type: 'integer',
      name: 'alias_id',
    },
    alias: {
      type: 'varchar',
      length: 255,
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
      joinColumn: {
        name: 'file_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    categories: {
      type: 'many-to-many',
      target: 'UseCaseCategory',
      joinTable: {
        name: 'use_case_categories',
        joinColumn: {
          name: 'use_case_system_id',
          referencedColumnName: 'systemId',
        },
        inverseJoinColumn: {
          name: 'category_system_id',
          referencedColumnName: 'systemId',
        },
      },
    },
    nodes: {
      type: 'many-to-many',
      target: 'Node',
      joinTable: {
        name: 'use_case_nodes',
        joinColumn: {
          name: 'use_case_system_id',
          referencedColumnName: 'systemId',
        },
        inverseJoinColumn: {
          name: 'node_system_id',
          referencedColumnName: 'systemId',
        },
      },
    },
    dataLinks: {
      type: 'many-to-many',
      target: 'DataLink',
      joinTable: {
        name: 'use_case_data_links',
        joinColumn: {
          name: 'use_case_system_id',
          referencedColumnName: 'systemId',
        },
        inverseJoinColumn: {
          name: 'data_link_system_id',
          referencedColumnName: 'systemId',
        },
      },
    },
    controlLinks: {
      type: 'many-to-many',
      target: 'ControlLink',
      joinTable: {
        name: 'use_case_control_links',
        joinColumn: {
          name: 'use_case_system_id',
          referencedColumnName: 'systemId',
        },
        inverseJoinColumn: {
          name: 'control_link_system_id',
          referencedColumnName: 'systemId',
        },
      },
    },
    keyVector: {
      type: 'one-to-one',
      target: 'KeyVector',
      inverseSide: 'useCase',
    },
  },
  indices: [
    {
      name: 'ix_use_case_alias',
      columns: ['aliasId'],
    },
    {
      name: 'ix_use_case_file',
      columns: ['fileSystemId'],
    },
  ],
});

export const UseCaseCategorySchema = new EntitySchema<UseCaseCategoryRow>({
  name: 'UseCaseCategory',
  tableName: 'use_case_categories_master',
  columns: {
    ...BaseColumnSchemaPart,
    name: {
      type: 'varchar',
      length: 255,
      unique: true,
    },
  },
  relations: {
    useCases: {
      type: 'many-to-many',
      target: 'UseCase',
      inverseSide: 'categories',
    },
  },
});
