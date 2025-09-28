import {BaseColumnSchemaPart, EntityBaseRow} from '../../entity-base.js';
import {PortIoType} from '../../definitions/module/spf/port-io-type-definition.schema.js';
import {EntitySchema} from 'typeorm';
import {NodeRow} from './node.schema.js';

export interface DataPortRow extends EntityBaseRow {
  dataPortId: number;
  name?: string;
  portIoType: PortIoType;
  isStatic: boolean;

  // Foreign key relation
  nodeSystemId: number;

  //type orm relation
  node: NodeRow;
}

export const DataPortSchema = new EntitySchema<DataPortRow>({
  name: 'DataPort',
  tableName: 'data_ports',
  columns: {
    ...BaseColumnSchemaPart,
    dataPortId: {
      type: 'integer',
      name: 'data_port_id',
    },
    name: {
      type: 'varchar',
      length: 255,
      nullable: true,
      name: 'name',
    },
    portIoType: {
      type: 'simple-enum',
      enum: Object.values(PortIoType),
      name: 'port_io_type',
    },
    isStatic: {
      type: 'boolean',
      name: 'is_static',
    },
    nodeSystemId: {
      type: 'integer',
      name: 'node_system_id',
    },
  },
  relations: {
    node: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
  },
});
