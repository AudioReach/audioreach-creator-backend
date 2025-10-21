export class VcpmParameterPayload {
  public systemId: number;
  public vcpmParameterSystemId: number;
  public payload: Uint8Array;

  constructor(systemId: number, vcpmParameterSystemId: number, payload: Uint8Array) {
    this.systemId = systemId;
    this.vcpmParameterSystemId = vcpmParameterSystemId;
    this.payload = payload;
  }
}
