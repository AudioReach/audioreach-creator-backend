import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {ArcDbFileRow} from '@infrastructure/database/entity-schema/project-data/arc-db-file.schema';
import {ContainerRow} from '@infrastructure/database/entity-schema/usecase-data/container/container.schema';
import {SubgraphRow} from '@infrastructure/database/entity-schema/usecase-data/subgraph/subgraph.schema';
import {SpfModulePropertiesDataRow} from '@infrastructure/database/entity-schema/usecase-data/module/spf-module-properties-data';
import {EntitySchema} from 'typeorm';
import {SpfModuleDefinitionRow} from '@infrastructure/database/entity-schema/definitions/module/spf/spf-module-definition.schema';

export interface SpfModuleRow extends EntityBaseRow {
  alias: string;

  // FKs(scalar columns you will set directly on writes)
  subgraphSystemId: number;
  containerSystemId: number;
  definitionSystemId: number;

  // persistence-only relations (optional)
  subgraph?: SubgraphRow;
  container?: ContainerRow;
  definition?: SpfModuleDefinitionRow;
  spfModulePropertiesData?: SpfModulePropertiesDataRow[];

  // scope to file
  fileSystemId: number;
  file?: ArcDbFileRow;
}

export const SpfModuleSchema = new EntitySchema<SpfModuleRow>({
  name: 'SpfModule',
  tableName: 'spf_modules',
  columns: {
    ...BaseColumnSchemaPart,
    alias: {type: String, length: 256},

    //  scalar FK columns you will set directly
    subgraphSystemId: {name: 'subgraph_system_id', type: 'integer'},
    containerSystemId: {name: 'container_system_id', type: 'integer'},
    definitionSystemId: {name: 'definition_system_id', type: 'integer'},

    fileSystemId: {name: 'file_system_id', type: 'integer'},
  },
  relations: {
    //  bind relation to the FK column via joinColumn
    subgraph: {
      type: 'many-to-one',
      target: 'Subgraph',
      joinColumn: {
        name: 'subgraph_system_id',
        referencedColumnName: 'system_id',
      },
      onDelete: 'CASCADE', // delete subgraph => delete modules
    },
    container: {
      type: 'many-to-one',
      target: 'Container',
      joinColumn: {
        name: 'container_system_id',
        referencedColumnName: 'system_id',
      },
      onDelete: 'CASCADE', //delete container => delete modules
    },
    definition: {
      type: 'many-to-one',
      target: 'SpfModuleDefinition',
      joinColumn: {
        name: 'definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT', // prevent deletion of definition if modules exist
    },
    spfModulePropertiesData: {
      type: 'one-to-many',
      target: 'SpfModulePropertiesData',
      inverseSide: 'module',
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete file => delete modules
    },
  },
  indices: [
    {name: 'ix_spf_modules_subgraph', columns: ['subgraph_system_id']},
    {name: 'ix_spf_modules_container', columns: ['container_system_id']},
    {name: 'ix_spf_modules_definition', columns: ['definition_system_id']},
  ],
});
