export class ContainerPropertyValue {
  public systemId: number;
  public containerPropertyDefinitionSystemId: number;
  public payload: Uint8Array;

  constructor(systemId: number, containerPropertyDefinitionSystemId: number, payload: Uint8Array) {
    this.systemId = systemId;
    this.containerPropertyDefinitionSystemId = containerPropertyDefinitionSystemId;
    this.payload = payload;
  }
}
