import {BaseColumnSchemaPart, EntityBaseRow} from '../../entity-base.js';
import {NodeRow} from '../node/node.schema.js';
import {DataPortRow} from '../node/data-port-info.schema.js';
import {UseCaseRow} from '../use-case.js';
import {EntitySchema} from 'typeorm';

export interface ControlLinkRow extends EntityBaseRow {
  peerNodeASystemId: number;
  peerNodeBSystemId: number;
  nodeAPortSystemId: number;
  nodeBPortSystemId: number;
  heapId: number;
  isInterGraph: boolean;

  peerNodeA?: NodeRow;
  peerNodeB?: NodeRow;
  nodeAPort?: DataPortRow;
  nodeBPort?: DataPortRow;
  useCases?: UseCaseRow[];
}

export const ControlLinkSchema = new EntitySchema<ControlLinkRow>({
  name: 'ControlLink',
  tableName: 'control_links',
  columns: {
    ...BaseColumnSchemaPart,
    peerNodeASystemId: {
      type: 'integer',
      name: 'peer_nodeA_system_id',
    },
    peerNodeBSystemId: {
      type: 'integer',
      name: 'peer_nodeB_system_id',
    },
    nodeAPortSystemId: {
      type: 'integer',
      name: 'nodeA_port_system_id',
    },
    nodeBPortSystemId: {
      type: 'integer',
      name: 'nodeB_port_system_id',
    },
    heapId: {
      type: 'integer',
      name: 'heap_id',
    },
    isInterGraph: {
      type: 'boolean',
      name: 'is_inter_graph',
    },
  },
  relations: {
    peerNodeA: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'peer_nodeA_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    peerNodeB: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'peer_nodeB_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    nodeAPort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'nodeA_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    nodeBPort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'nodeB_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    useCases: {
      type: 'many-to-many',
      target: 'UseCase',
      inverseSide: 'controlLinks',
    },
  },
  indices: [
    {
      name: 'uk_control_link_unique',
      columns: [
        'peerNodeASystemId',
        'peerNodeBSystemId',
        'nodeAPortSystemId',
        'nodeBPortSystemId',
      ],
      unique: true,
    },
  ],
});
