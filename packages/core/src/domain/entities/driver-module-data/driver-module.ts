/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DkvData} from './dkv-data.js';

export interface DriverModuleInit {
  systemId: number;
  definitionSystemId: number;
  fileSystemId: number;
}

/**
 * Represents a driver module instance.
 * Driver modules have a one-to-one relationship with their definitions.
 */
export class DriverModule {
  systemId: number;
  readonly definitionSystemId: number;
  readonly fileSystemId: number;
  readonly dkvData: DkvData[] = [];

  constructor(init: DriverModuleInit) {
    this.systemId = init.systemId;
    this.definitionSystemId = init.definitionSystemId;
    this.fileSystemId = init.fileSystemId;
  }

  /**
   * Add DKV (Driver Key-Value) calibration data to this module
   */
  addDkvData(dkv: DkvData): void {
    this.dkvData.push(dkv);
  }
}
