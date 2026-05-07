/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KvData} from '../../../common/entities/kv-data.js';

export class DuplicateTkvExceptionError extends Error {
  constructor(
    readonly idType: 'systemId' | 'valueDefinitionSystemIds',
    readonly id: number | string,
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
    const valuesKey = `vals:${[...tkv.valueDefinitionSystemIds].sort((a, b) => a - b).join(',')}`;

    if (this.tkvIds.has(systemIdKey))
      throw new DuplicateTkvExceptionError('systemId', tkv.systemId);
    if (this.tkvIds.has(valuesKey))
      throw new DuplicateTkvExceptionError(
        'valueDefinitionSystemIds',
        valuesKey,
      );

    this.tkvIds.add(systemIdKey);
    this.tkvIds.add(valuesKey);
    this.tkvs.push(tkv);
  }
}
