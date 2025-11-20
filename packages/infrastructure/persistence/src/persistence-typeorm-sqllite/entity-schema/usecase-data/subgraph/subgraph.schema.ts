import {BaseColumnSchemaPart, EntityBaseRow} from '../../entity-base.js';
import {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import {SpfModuleRow} from '../module/spf-module.schema.js';
import {VcpmInstanceRow} from './subgraph-vcpm-data.js';
import {EntitySchema} from 'typeorm';

export interface SubgraphRow extends EntityBaseRow {
  name: string;
  naturalId: number;

  // true: if subgraph is exported from another acdb file
  isExported: boolean;

  // inverse relation for convenience (reads/cascade)
  modules?: SpfModuleRow[];
  vcpmInstances?: VcpmInstanceRow[];

  // scope to file
  fileSystemId: number;
  file?: ArcDbFileRow;
}

export const SubgraphSchema = new EntitySchema<SubgraphRow>({
  name: 'Subgraph',
  tableName: 'subgraphs',
  columns: {
    ...BaseColumnSchemaPart,
    name: {type: String, length: 256},
    naturalId: {name: 'natural_id', type: 'integer'},
    isExported: {name: 'is_exported', type: 'boolean'},
    fileSystemId: {name: 'file_system_id', type: 'integer'},
  },
  relations: {
    // Inverse for convenience.
    modules: {
      type: 'one-to-many',
      target: 'SpfModule',
      inverseSide: 'subgraph', // <-- matches relation prop on SpfModuleRow
    },
    vcpmInstances: {
      type: 'one-to-many',
      target: 'VcpmInstance',
      inverseSide: 'subgraph',
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete file => delete subgraphs
    },
  },
  indices: [
    {name: 'ix_subgraphs_name', columns: ['name']},
    {name: 'ix_subgraphs_natural_id', columns: ['naturalId']},
  ],
});
