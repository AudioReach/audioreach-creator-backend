import { ParameterPayload } from "../value-objects/parameter-payload.value.js";

export class Tkv {
  public systemId: number;
  public parameterPayloads: Map<number, ParameterPayload>;
  public keyVectorSystemId: number;
  public uiPersistence: Uint8Array;

  constructor(
    systemId: number,
    keyVectorSystemId: number,
    uiPersistence: Uint8Array
  ) {
    this.systemId = systemId;
    this.keyVectorSystemId = keyVectorSystemId;
    this.uiPersistence = uiPersistence;
    this.parameterPayloads = new Map<number, ParameterPayload>();
  }
}
