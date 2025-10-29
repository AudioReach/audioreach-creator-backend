import type {ControlPortEntity} from './entities/control-port.entity.js';
import type {DataPortEntity} from './entities/data-port.entity.js';

export const NodeType = {
  Module: 'module',
  Subsystem: 'subsystem',
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export class NodeEntity {
  readonly systemId: number;
  readonly parentId?: number;
  readonly type: NodeType;
  readonly fileSystemId: number;

  readonly dataPorts: DataPortEntity[];
  readonly controlPorts: ControlPortEntity[];

  constructor(initparams: {
    systemId: number;
    type: NodeType;
    fileSystemId: number;
    parentId?: number;
    dataPorts: DataPortEntity[];
    controlPorts: ControlPortEntity[];
  }) {
    this.systemId = initparams.systemId;
    this.type = initparams.type;
    this.fileSystemId = initparams.fileSystemId;
    this.parentId = initparams.parentId;
    this.dataPorts = initparams.dataPorts;
    this.controlPorts = initparams.controlPorts;
  }
}
