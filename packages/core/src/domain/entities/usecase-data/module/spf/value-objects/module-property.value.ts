export class ModulePropertyValue {
  public systemId: number;
  public modulePropertyDefinitionSystemId: number;
  public payload: Uint8Array;

  constructor(systemId: number, modulePropertyDefinitionSystemId: number, payload: Uint8Array) {
    this.systemId = systemId;
    this.modulePropertyDefinitionSystemId = modulePropertyDefinitionSystemId;
    this.payload = payload;
  }
}
