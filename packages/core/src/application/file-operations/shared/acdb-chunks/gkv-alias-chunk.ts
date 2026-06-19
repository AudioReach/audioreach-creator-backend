/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {KeyValuePairList} from '../../../../shared/types/key-value-pair.js';

export interface GkvAliasEntry {
  usecaseId: number;
  usecaseName?: string;
}

export class GkvAliasChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.GKV_ALIAS_DATA;
  private readonly aliasMap: Map<string, GkvAliasEntry> = new Map();

  private toKey(kvpl: KeyValuePairList): string {
    return kvpl.keyValueList.map(kv => `${kv.keyId}:${kv.value}`).join('|');
  }

  setAlias(kvpl: KeyValuePairList, entry: GkvAliasEntry): void {
    this.aliasMap.set(this.toKey(kvpl), entry);
  }

  getAlias(kvpl: KeyValuePairList): GkvAliasEntry | undefined {
    return this.aliasMap.get(this.toKey(kvpl));
  }
}
