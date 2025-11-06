import type {PortIoType} from 'domain/entities/common/enums/port-io-type.js';
import {DataPortDefinition} from './data-port-definition.js';

export interface DataPortGroupDefinitionInit {
  max: number;
  portIoType: PortIoType;
  staticPortDefinitions: DataPortDefinition[];
}

export class DataPortGroupDefinition {
  maxAllowedPortCount: number;
  portIoType: PortIoType;
  readonly staticPortDefinitions: DataPortDefinition[] = [];

  constructor(initParam: DataPortGroupDefinitionInit) {
    this.maxAllowedPortCount = initParam.max;
    this.portIoType = initParam.portIoType;
    this.staticPortDefinitions = initParam.staticPortDefinitions;
    this.checkInvariants();
  }

  checkInvariants() {
    const seen = new Set<number>();
    for (const port of this.staticPortDefinitions) {
      if (seen.has(port.dataPortId)) {
        throw new Error(`Duplicate dataPortId: ${port.dataPortId}`);
      }
      seen.add(port.dataPortId);
    }
  }
}
