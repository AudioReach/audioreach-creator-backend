import {BaseColumnSchemaPart, type EntityBaseRow} from '../entity-base.js';
import {
  type InterfaceTypeValue,
  type InterfaceVersionValue,
  type ModuleTypeValue,
  ModuleTypeTransformer,
  InterfaceTypeTransformer,
  InterfaceVersionTransformer,
} from './types.js';
import {EntitySchema} from 'typeorm';

export interface ModuleManagerDataRow extends EntityBaseRow {
  moduleType: ModuleTypeValue; // 2|3|4|5|6|7
  interfaceType: InterfaceTypeValue; // 2
  interfaceVersion: InterfaceVersionValue;
  fileName: string;
  tag: string;
}

export const ModuleManagerDataSchema = new EntitySchema<ModuleManagerDataRow>({
  name: 'ModuleManagerData',
  tableName: 'module_manager_data',
  columns: {
    ...BaseColumnSchemaPart,
    moduleType: {
      name: 'module_type',
      type: 'integer',
      transformer: ModuleTypeTransformer,
    },
    interfaceType: {
      name: 'interface_type',
      type: 'integer',
      transformer: InterfaceTypeTransformer,
    },
    interfaceVersion: {
      name: 'interface_version',
      type: 'integer',
      transformer: InterfaceVersionTransformer,
    },
    fileName: {
      name: 'file_name',
      type: 'varchar',
      length: 255,
    },
    tag: {
      name: 'tag',
      type: 'varchar',
      length: 100,
    },
  },
});
