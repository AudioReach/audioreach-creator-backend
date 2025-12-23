import {BaseColumnSchemaPart, EntityBaseRow} from '../entity-base.js';
import {ArcDbFileRow} from './arc-db-file.schema.js';
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
    name: {type: 'varchar', length: 256},
    description: {type: 'text'},
    type: {type: 'varchar', length: 64},
  },
  relations: {
    // read convenience only; no save-cascade
    files: {
      type: 'one-to-many',
      target: 'ArcDbFile',
      inverseSide: 'project',
    },
  },
  indices: [{name: 'uk_projects_name', columns: ['name'], unique: true}],
});
