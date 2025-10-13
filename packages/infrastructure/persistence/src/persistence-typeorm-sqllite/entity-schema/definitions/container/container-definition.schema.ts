import {BaseColumnSchemaPart, EntityBaseRow} from '../../entity-base.js';
import {EntitySchema} from 'typeorm';

export interface ContainerTypeRow extends EntityBaseRow {
  containerId: number;
  name: string;
  value: number;
}

export const ContainerTypeSchema = new EntitySchema<ContainerTypeRow>({
  name: 'ContainerType',
  tableName: 'container_types',
  columns: {
    ...BaseColumnSchemaPart,
    name: {
      type: 'varchar',
      length: 255,
      name: 'name',
    },
    value: {
      type: 'integer',
      name: 'value',
    },
  },
});
