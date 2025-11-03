import { VcpmParameterPayload } from "./vcpm-parameter-payload.js";

export class VcpmCkv {
  public systemId: number;
  public keyVectorSystemId: number;
  public uiPersistence: Uint8Array;

  public vcpmParameterPayloads: Map<number, VcpmParameterPayload>;

  constructor(systemId: number, keyVectorSystemId: number, uiPersistence: Uint8Array) {
    this.systemId = systemId;
    this.keyVectorSystemId = keyVectorSystemId;
    this.uiPersistence = uiPersistence;

    this.vcpmParameterPayloads = new Map<number, VcpmParameterPayload>();
  }
}
