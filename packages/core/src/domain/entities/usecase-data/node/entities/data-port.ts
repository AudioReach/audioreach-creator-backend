import type {PortIoType} from 'domain/entities/common/enums/port-io-type.js';

export class DataPort {
  readonly systemId: number;
  readonly dataPortId: number;
  readonly portIoType: PortIoType;
  readonly isStatic: boolean;
  readonly name?: string;

  constructor(params: {
    systemId: number;
    dataPortId: number;
    portIoType: PortIoType;
    isStatic: boolean;
    name?: string;
  }) {
    this.systemId = params.systemId;
    this.dataPortId = params.dataPortId;
    this.portIoType = params.portIoType;
    this.isStatic = params.isStatic;
    this.name = params.name;
  }
}
