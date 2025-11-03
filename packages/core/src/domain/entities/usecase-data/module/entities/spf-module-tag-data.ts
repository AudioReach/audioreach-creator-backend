import type {KvData} from 'domain/entities/common/entities/kv-data.js';

export class DuplicateTkvExceptionError extends Error {
  constructor(
    readonly idType: 'systemId' | 'keyVectorSystemId',
    readonly id: number,
  ) {
    super(`Tkv with ${idType} ${id} already exists`);
    this.name = 'DuplicateTkvExceptionError';
  }
}

export interface TagDataInit {
  systemId: number;
  tagDefinitionSystemId: number;
}
/**
 * used for adding tag data, update will use kvData class directly or ParamPayload
 */
export class TagData {
  private readonly tkvIds = new Set<string>();
  readonly tkvs: KvData[] = [];
  readonly systemId: number;
  readonly tagDefinitionSystemId: number;
  constructor(init: TagDataInit) {
    this.systemId = init.systemId;
    this.tagDefinitionSystemId = init.tagDefinitionSystemId;
  }

  addTkv(tkv: KvData): void {
    const systemIdKey = `sys:${tkv.systemId}`;
    const keyVectorIdKey = `kv:${tkv.keyVectorSystemId}`;

    if (this.tkvIds.has(systemIdKey))
      throw new DuplicateTkvExceptionError('systemId', tkv.systemId);
    if (this.tkvIds.has(keyVectorIdKey))
      throw new DuplicateTkvExceptionError(
        'keyVectorSystemId',
        tkv.keyVectorSystemId,
      );

    this.tkvIds.add(systemIdKey);
    this.tkvIds.add(keyVectorIdKey);
    this.tkvs.push(tkv);
  }
}
