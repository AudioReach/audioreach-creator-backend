export class SubgraphPropertyValue {
  public systemId: number;
  public subgraphPropertyDefinitionSystemId: number;
  public payload: Uint8Array;

  constructor(systemId: number, subgraphPropertyDefinitionSystemId: number, payload: Uint8Array) {
    this.systemId = systemId;
    this.subgraphPropertyDefinitionSystemId = subgraphPropertyDefinitionSystemId;
    this.payload = payload;
  }
}
