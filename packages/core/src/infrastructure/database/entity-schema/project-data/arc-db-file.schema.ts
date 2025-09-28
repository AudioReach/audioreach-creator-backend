import {BaseColumnSchemaPart, EntityBaseRow} from '../entity-base.js';
import {ProjectRow} from './project.schema.js';
import {ContainerRow} from '../usecase-data/container/container.schema.js';
import {SpfModuleRow} from '../usecase-data/module/spf-module.schema.js';
import {SubgraphRow} from '../usecase-data/subgraph/subgraph.schema.js';
import {EntitySchema} from 'typeorm';

export interface ArcDbFileRow extends EntityBaseRow {
  description: string;
  metadata: string;
  tag: string;
  isTarget: boolean;

  // FK to project
  projectSystemId: number;
  project?: ProjectRow;

  // optional inverses (convenience for reads)
  subgraphs?: SubgraphRow[];
  containers?: ContainerRow[];
  modules?: SpfModuleRow[];
}

export const ArcDbFileSchema = new EntitySchema<ArcDbFileRow>({
  name: 'ArcDbFile',
  tableName: 'files',
  columns: {
    ...BaseColumnSchemaPart,
    description: {type: 'text'},
    metadata: {type: 'text'}, // or use `type: 'simple-json'` if you prefer object serialization
    tag: {type: String, length: 128},
    isTarget: {type: Boolean},

    projectSystemId: {name: 'project_system_id', type: 'integer'},
  },
  relations: {
    project: {
      type: 'many-to-one',
      target: 'Project',
      joinColumn: {name: 'project_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete project => delete files
    },

    // Optional read-only inverses (no save-cascade)
    subgraphs: {type: 'one-to-many', target: 'Subgraph', inverseSide: 'file'},
    containers: {type: 'one-to-many', target: 'Container', inverseSide: 'file'},
    modules: {type: 'one-to-many', target: 'SpfModule', inverseSide: 'file'},
  },
  indices: [{name: 'ix_files_project', columns: ['project_system_id']}],
});
