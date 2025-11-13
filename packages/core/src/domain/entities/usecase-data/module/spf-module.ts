import {TagData} from './entities/spf-module-tag-data.js';
import type {KvData} from '../../common/entities/kv-data.js';
import {CkvCollection} from 'domain/entities/common/entities/ckv-collection.js';
import {Node, NodeType} from '../node/node.js';
import type {DataPort} from '../node/entities/data-port.js';
import type {ControlPort} from '../node/entities/control-port.js';

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
  instanceId: number;
  parentSystemId?: number;
  definitionSystemId: number;
  containerSystemId: number;
  subgraphSystemId: number;
  fileSystemId: number;
  alias?: string;
  dataPorts: DataPort[];
  controlPorts: ControlPort[];
}

export class SpfModule extends Node {
  private readonly tagIds = new Set<string>();
  private readonly ckvCollection = new CkvCollection();

  readonly definitionSystemId: number;
  readonly containerSystemId: number;
  readonly subgraphSystemId: number;
  readonly alias?: string;
  readonly tagDataList: TagData[] = [];

  get ckvs(): readonly KvData[] {
    return this.ckvCollection.ckvs;
  }

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
    this.ckvCollection.addCkv(kvData);
  }
}
