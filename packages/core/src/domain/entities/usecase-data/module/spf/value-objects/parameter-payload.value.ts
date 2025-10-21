export class ParameterPayload {
  public systemId: number;
  public parameterSystemId: number;
  public payload: Uint8Array;

  constructor(systemId: number, parameterSystemId: number, payload: Uint8Array) {
    this.systemId = systemId;
    this.parameterSystemId = parameterSystemId;
    this.payload = payload;
  }
}
