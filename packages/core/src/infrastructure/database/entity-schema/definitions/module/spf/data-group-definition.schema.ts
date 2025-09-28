import {EntityBaseRow} from '../../../entity-base.js';
import {EntitySchema} from 'typeorm';
import {DataPortDefinitionRow} from './data-port-definition.schema.js';
import {SpfModuleDefinitionRow} from './spf-module-definition.schema.js';
import {PortIoType} from './port-io-type-definition.schema.js';

export interface DataPortGroupRow extends EntityBaseRow {
  max: number;
  portIoType: PortIoType;

  // Foreign key relation
  moduleDefinitionSystemId: number;

  // Relations
  ports?: DataPortDefinitionRow[];

  //type orm relation
  moduleDefinition: SpfModuleDefinitionRow;
}

export const DataPortGroupSchema = new EntitySchema<DataPortGroupRow>({
  name: 'DataPortGroup',
  tableName: 'data_port_groups',
  columns: {
    max: {
      type: 'integer',
      default: 0,
      name: 'max',
    },
    portIoType: {
      type: 'varchar',
      enum: PortIoType,
      name: 'port_io_type',
    },
    moduleDefinitionSystemId: {
      type: 'integer',
      name: 'module_definition_system_id',
    },
  },
  relations: {
    moduleDefinition: {
      type: 'many-to-one',
      target: 'SpfModuleDefinition',
      joinColumn: {
        name: 'module_definition_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    ports: {
      type: 'one-to-many',
      target: 'DataPortDefinition',
      inverseSide: 'dataPortGroup',
      cascade: ['insert', 'update'],
    },
  },
  indices: [
    {
      name: 'idx_data_port_groups_module_def_id',
      columns: ['module_definition_system_id'],
    },
  ],
});
