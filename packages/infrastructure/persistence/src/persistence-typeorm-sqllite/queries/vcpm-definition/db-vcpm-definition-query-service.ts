/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {VcpmDefinitionQueryService, VcpmModuleDefinition} from '@arc/core';
import {VcpmModuleDefinitionFetcher} from '../../fetchers/definitions/vcpm/vcpm-module-definition-fetcher.js';

export class DbVcpmDefinitionQueryService implements VcpmDefinitionQueryService {
  private readonly definitionFetcher: VcpmModuleDefinitionFetcher;

  constructor(dataSource: DataSource) {
    this.definitionFetcher = new VcpmModuleDefinitionFetcher(
      dataSource.manager,
    );
  }

  async getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinition[]> {
    return this.definitionFetcher.fetchMany(fileSystemId);
  }
}
