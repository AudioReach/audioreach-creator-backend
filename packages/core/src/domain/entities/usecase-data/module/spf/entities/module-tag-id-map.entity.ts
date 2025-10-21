import { Tkv } from "./tkv.entity.js";

export class ModuleTagIdMap {
  public systemId: number;
  public tkvs: Map<number, Tkv>;
  public tagDefinitionSystemId: number;

  constructor(systemId: number, tagDefinitionSystemId: number) {
    this.systemId = systemId;
    this.tagDefinitionSystemId = tagDefinitionSystemId;
    this.tkvs = new Map<number, Tkv>();
  }
}
