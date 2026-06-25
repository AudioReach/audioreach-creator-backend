/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface SgkvInit {
  systemId: number;
  valueDefinitionSystemIds: readonly number[];
}

export class Sgkv {
  systemId: number;
  readonly valueDefinitionSystemIds: readonly number[];

  constructor(init: SgkvInit) {
    this.systemId = init.systemId;
    this.valueDefinitionSystemIds = init.valueDefinitionSystemIds;
  }
}
