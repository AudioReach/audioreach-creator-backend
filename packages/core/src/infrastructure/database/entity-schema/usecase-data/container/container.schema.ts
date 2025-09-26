import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {ArcDbFileRow} from '@infrastructure/database/entity-schema/project-data/arc-db-file.schema';
import {SpfModuleRow} from '@infrastructure/database/entity-schema/usecase-data/module/spf-module.schema';
import {ContainerPropertyDataRow} from '@infrastructure/database/entity-schema/usecase-data/container/container-property-data';
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
    type: {type: String, length: 128},
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
