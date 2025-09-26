import {
  BaseColumnSchemaPart,
  EntityBaseRow,
} from '@infrastructure/database/entity-schema/entity-base';
import {ArcDbFileRow} from '@infrastructure/database/entity-schema/project-data/arc-db-file.schema';
import {EntitySchema} from 'typeorm';

export interface ProjectRow extends EntityBaseRow {
  name: string;
  description: string;
  type: string;
  files?: ArcDbFileRow[];
}

export const ProjectSchema = new EntitySchema<ProjectRow>({
  name: 'Project',
  tableName: 'projects',
  columns: {
    ...BaseColumnSchemaPart,
    name: {type: String, length: 256},
    description: {type: 'text'},
    type: {type: String, length: 64},
  },
  relations: {
    // read convenience only; no save-cascade
    files: {
      type: 'one-to-many',
      target: 'ArcDbFile',
      inverseSide: 'project',
    },
  },
  indices: [{name: 'ix_projects_type', columns: ['type']}],
});
