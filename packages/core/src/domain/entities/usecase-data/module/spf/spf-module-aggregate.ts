import { ModulePropertyValue } from "./value-objects/module-property.value.js";
import { ModuleTagIdMap } from "./entities/module-tag-id-map.entity.js";
import { Ckv } from "./entities/ckv.entity.js";

export class SpfModuleAggregate {
  // Identity and cross-aggregate references (ids only)
  public systemId: number;
  public definitionSystemId: number;
  public containerSystemId: number;
  public subgraphSystemId: number;
  public fileSystemId: number;
  public alias?: string;

  // Owned collections
  public properties: Map<number, ModulePropertyValue>;
  public tagMaps: Map<number, ModuleTagIdMap>;
  public ckvs: Map<number, Ckv>;

  constructor(
    systemId: number,
    definitionSystemId: number,
    containerSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    alias?: string
  ) {
    this.systemId = systemId;
    this.definitionSystemId = definitionSystemId;
    this.containerSystemId = containerSystemId;
    this.subgraphSystemId = subgraphSystemId;
    this.fileSystemId = fileSystemId;
    this.alias = alias;

    this.properties = new Map<number, ModulePropertyValue>();
    this.tagMaps = new Map<number, ModuleTagIdMap>();
    this.ckvs = new Map<number, Ckv>();
  }
}
