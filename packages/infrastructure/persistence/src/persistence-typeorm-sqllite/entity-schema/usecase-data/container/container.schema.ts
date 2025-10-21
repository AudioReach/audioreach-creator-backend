import {BaseColumnSchemaPart, EntityBaseRow} from '../../entity-base.js';
import {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import {SpfModuleRow} from '../module/spf-module.schema.js';
import {ContainerPropertyDataRow} from './container-property-data.js';
import {EntitySchema} from 'typeorm';

export interface ContainerRow extends EntityBaseRow {
  type: string;

  // inverse relation for convenience (reads)
  modules?: SpfModuleRow[];
  containerPropertyData?: ContainerPropertyDataRow[];
  // scope to file
  fileSystemId: number;
  file?: ArcDbFileRow;
}

export const ContainerSchema = new EntitySchema<ContainerRow>({
  name: 'Container',
  tableName: 'containers',
  columns: {
    ...BaseColumnSchemaPart,
    type: {name: 'type', type: 'varchar', length: 128},
    fileSystemId: {name: 'file_system_id', type: 'integer'},
  },
  relations: {
    modules: {
      type: 'one-to-many',
      target: 'SpfModule',
      inverseSide: 'container',
    },
    containerPropertyData: {
      type: 'one-to-many',
      target: 'ContainerPropertyData',
      inverseSide: 'container',
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete file => delete containers
    },
  },
  indices: [{name: 'ix_containers_type', columns: ['type']}],
});
