import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {ArcDbFileRow} from '@infrastructure/database/entity-schema/project-data/arc-db-file.schema';
import {SpfModuleRow} from '@infrastructure/database/entity-schema/usecase-data/module/spf-module.schema';
import {VcpmInstanceRow} from '@infrastructure/database/entity-schema/usecase-data/subgraph/subgraph-vcpm-data';
import {EntitySchema} from 'typeorm/entity-schema/EntitySchema';

export interface SubgraphRow extends EntityBaseRow {
  name: string;

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
  indices: [{name: 'ix_subgraphs_name', columns: ['name']}],
});
