import type {KvData} from 'domain/entities/common/entities/kv-data.js';
import {CkvCollection} from 'domain/entities/common/entities/ckv-collection.js';

export interface vcpmModuleInstanceInit {
  systemId: number;
  subgraphSystemId: number;
  vcpmDefinitionId: number;
}
export class VcpmInstance {
  private readonly ckvCollection = new CkvCollection();

  readonly systemId: number;
  readonly subgraphSystemId: number;
  readonly vcpmModuleDefinitionId: number;

  get ckvs(): readonly KvData[] {
    return this.ckvCollection.ckvs;
  }

  constructor(initParams: vcpmModuleInstanceInit) {
    this.systemId = initParams.systemId;
    this.subgraphSystemId = initParams.subgraphSystemId;
    this.vcpmModuleDefinitionId = initParams.vcpmDefinitionId;
  }

  addCkv(kvData: KvData) {
    this.ckvCollection.addCkv(kvData);
  }
}
