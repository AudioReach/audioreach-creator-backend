import type {SpfModulePropertyData} from './value-objects/spf-module-property-data.vo.js';
import {TagData} from './entities/spf-module-tag-data.js';
import type {KvData} from 'domain/entities/common/entities/kv-data.entity.js';
import {NodeEntity, NodeType} from '../node/node.entity.js';
import type {DataPortEntity} from '../node/entities/data-port.entity.js';
import type {ControlPortEntity} from '../node/entities/control-port.entity.js';

export class DuplicateCkvExceptionError extends Error {
  constructor(
    readonly idType: 'systemId' | 'keyVectorSystemId',
    readonly id: number,
  ) {
    super(`Ckv with ${idType} ${id} already exists`);
    this.name = 'DuplicateCkvExceptionError';
  }
}

export class DuplicateTagExceptionError extends Error {
  constructor(
    readonly idType: 'systemId' | 'tagDefinitionSystemId',
    readonly id: number,
  ) {
    super(`Tag with ${idType} ${id} already exists`);
    this.name = 'DuplicateTagExceptionError';
  }
}

export interface SpfModuleInit {
  systemId: number;
  parentSystemId?: number;
  definitionSystemId: number;
  containerSystemId: number;
  subgraphSystemId: number;
  fileSystemId: number;
  alias?: string;
  dataPorts: DataPortEntity[];
  controlPorts: ControlPortEntity[];
}

export class SpfModule extends NodeEntity {
  private readonly propertiesById = new Map<number, SpfModulePropertyData>();
  private readonly tagIds = new Set<string>();
  private readonly ckvIds = new Set<string>();

  readonly definitionSystemId: number;
  readonly containerSystemId: number;
  readonly subgraphSystemId: number;
  readonly alias?: string;
  readonly propertes: SpfModulePropertyData[] = [];
  readonly tagDataList: TagData[] = [];
  readonly ckvs: KvData[] = [];

  constructor(init: SpfModuleInit) {
    super({
      systemId: init.systemId,
      type: NodeType.Module,
      dataPorts: init.dataPorts,
      controlPorts: init.controlPorts,
      parentId: init.parentSystemId,
      fileSystemId: init.fileSystemId,
    });
    this.definitionSystemId = init.definitionSystemId;
    this.containerSystemId = init.containerSystemId;
    this.subgraphSystemId = init.subgraphSystemId;
    this.alias = init.alias ?? '';
  }

  addModuleProperty(propValue: SpfModulePropertyData) {
    const propId = propValue.propertyDefinitionSystemId;
    if (this.propertiesById.has(propId)) {
      throw new Error(`Property with ${propId} already exists`);
    }
    this.propertiesById.set(propId, propValue);
    this.propertes.push(propValue);
  }

  addTagData(tagData: TagData) {
    const systemIdKey = `sys:${tagData.systemId}`;
    const tagDefIdKey = `tagDef:${tagData.tagDefinitionSystemId}`;

    if (this.tagIds.has(systemIdKey))
      throw new DuplicateTagExceptionError('systemId', tagData.systemId);
    if (this.tagIds.has(tagDefIdKey))
      throw new DuplicateTagExceptionError(
        'tagDefinitionSystemId',
        tagData.tagDefinitionSystemId,
      );

    this.tagIds.add(systemIdKey);
    this.tagIds.add(tagDefIdKey);
    this.tagDataList.push(tagData);
  }

  addModuleCkv(kvData: KvData) {
    const systemIdKey = `sys:${kvData.systemId}`;
    const keyVectorIdKey = `kv:${kvData.keyVectorSystemId}`;

    if (this.ckvIds.has(systemIdKey))
      throw new DuplicateCkvExceptionError('systemId', kvData.systemId);
    if (this.ckvIds.has(keyVectorIdKey))
      throw new DuplicateCkvExceptionError(
        'keyVectorSystemId',
        kvData.keyVectorSystemId,
      );

    this.ckvIds.add(systemIdKey);
    this.ckvIds.add(keyVectorIdKey);
    this.ckvs.push(kvData);
  }
}
