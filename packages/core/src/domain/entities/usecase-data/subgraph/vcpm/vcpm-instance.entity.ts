import { VcpmCkv } from "./vcpm-ckv.entity.js";

export class VcpmInstance {
  public systemId: number;
  public subgraphSystemId: number;
  public vcpmDefinitionId: number;

  public vcpmCkvs: Map<number, VcpmCkv>;

  constructor(systemId: number, subgraphSystemId: number, vcpmDefinitionId: number) {
    this.systemId = systemId;
    this.subgraphSystemId = subgraphSystemId;
    this.vcpmDefinitionId = vcpmDefinitionId;

    this.vcpmCkvs = new Map<number, VcpmCkv>();
  }
}
