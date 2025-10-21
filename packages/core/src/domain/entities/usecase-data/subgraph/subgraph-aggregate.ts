import { SubgraphPropertyValue } from "./value-objects/subgraph-property.value.js";
import { VcpmInstance } from "./vcpm/vcpm-instance.entity.js";

export class SubgraphAggregate {
  public systemId: number;
  public name: string;
  public isExported: boolean;
  public fileSystemId: number;

  public properties: Map<number, SubgraphPropertyValue>;
  public vcpmInstances: Map<number, VcpmInstance>;

  constructor(
    systemId: number,
    name: string,
    isExported: boolean,
    fileSystemId: number
  ) {
    this.systemId = systemId;
    this.name = name;
    this.isExported = isExported;
    this.fileSystemId = fileSystemId;
    this.properties = new Map<number, SubgraphPropertyValue>();
    this.vcpmInstances = new Map<number, VcpmInstance>();
  }
}
