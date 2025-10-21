export class ControlPortEntity {
  public systemId: number;
  public portId: number;
  public name?: string;
  public isStatic: boolean;
  public nodeSystemId: number;

  constructor(
    systemId: number,
    portId: number,
    isStatic: boolean,
    nodeSystemId: number,
    name?: string
  ) {
    this.systemId = systemId;
    this.portId = portId;
    this.isStatic = isStatic;
    this.nodeSystemId = nodeSystemId;
    this.name = name;
  }
}
