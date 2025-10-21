import { ContainerPropertyValue } from "./value-objects/container-property.value.js";

export class ContainerAggregate {
  public systemId: number;
  public type: string;
  public fileSystemId: number;

  public properties: Map<number, ContainerPropertyValue>;

  constructor(systemId: number, type: string, fileSystemId: number) {
    this.systemId = systemId;
    this.type = type;
    this.fileSystemId = fileSystemId;

    this.properties = new Map<number, ContainerPropertyValue>();
  }
}
