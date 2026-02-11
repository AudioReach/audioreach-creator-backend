/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface TagDefKeyDefInit {
  keyReferenceSystemId: number;
  tagEnumValue?: string;
}

export class TagDefKeyDefLink {
  readonly keyReferenceSystemId: number;
  tagEnumValue: string;

  constructor(initParam: TagDefKeyDefInit) {
    this.keyReferenceSystemId = initParam.keyReferenceSystemId;
    this.tagEnumValue = initParam.tagEnumValue ?? '';
  }
}
