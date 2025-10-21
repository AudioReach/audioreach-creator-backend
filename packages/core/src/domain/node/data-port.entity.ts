import { PortIoType } from "./port-io-type.js";

export class DataPortEntity {
  public systemId: number;
  public dataPortId: number;
  public name?: string;
  public portIoType: PortIoType;
  public isStatic: boolean;
  public nodeSystemId: number;

  constructor(
    systemId: number,
    dataPortId: number,
    portIoType: PortIoType,
    isStatic: boolean,
    nodeSystemId: number,
    name?: string
  ) {
    this.systemId = systemId;
    this.dataPortId = dataPortId;
    this.portIoType = portIoType;
    this.isStatic = isStatic;
    this.nodeSystemId = nodeSystemId;
    this.name = name;
  }
}
