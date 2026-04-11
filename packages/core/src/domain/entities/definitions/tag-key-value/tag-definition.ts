/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {TagDefKeyDefLink} from './value-objects/tag-key.js';
import {assertNonNull, invariant} from '../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

export interface TagDefinitionInit {
  systemId: number;
  tagId: number;
  name: string;
  description?: string;
  keysAllowed: TagDefKeyDefLink[];
  isVoice: boolean;
  cHeaderEnumName?: string;
  cHeaderEnumValue?: string;
}

export class TagDefinition {
  readonly systemId: number;
  readonly tagId: number;
  readonly keysAllowed: TagDefKeyDefLink[] = [];
  name: string;
  description?: string;
  isVoice: boolean;
  cHeaderEnumName?: string;
  cHEaderEnumValue?: string;

  private readonly keyIds: Set<number>;

  constructor(initParam: TagDefinitionInit) {
    this.systemId = initParam.systemId;
    this.tagId = initParam.tagId;
    this.name = initParam.name;
    this.description = initParam.description;
    this.isVoice = initParam.isVoice;
    this.cHeaderEnumName = initParam.cHeaderEnumName;
    this.cHEaderEnumValue = initParam.cHeaderEnumValue;
    this.keyIds = new Set<number>();
    for (const key of initParam.keysAllowed) {
      this.AddTagKey(key);
    }
  }

  private AddTagKey(tagKey: TagDefKeyDefLink) {
    assertNonNull(tagKey, 'tagKey is null');
    assertNonNull(
      tagKey.keyReferenceSystemId,
      `keyReferenceSystemId is required for tag ${BinaryUtils.toHexString(this.tagId)}`,
    );

    invariant(
      !this.keyIds.has(tagKey.keyReferenceSystemId),
      `Tag Key ${BinaryUtils.toHexString(tagKey.keyReferenceSystemId)} already exists in TagDefinition for Tag: ${BinaryUtils.toHexString(this.tagId)}`,
    );

    this.keyIds.add(tagKey.keyReferenceSystemId);
    this.keysAllowed.push(tagKey);
  }
}
