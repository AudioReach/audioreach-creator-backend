/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  VcpmDefinitionRepository,
  VcpmModuleDefinitionWithParamsReadModel,
} from '@arc/core';
import {VcpmModuleDefinitionFetcher} from '../../fetchers/definitions/vcpm/vcpm-module-definition-fetcher.js';

/** TypeORM adapter for effective VCPM module-definition reads. */
export class TypeOrmVcpmDefinitionRepository implements VcpmDefinitionRepository {
  private readonly definitionFetcher: VcpmModuleDefinitionFetcher;

  constructor(manager: EntityManager) {
    this.definitionFetcher = new VcpmModuleDefinitionFetcher(manager);
  }

  async getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]> {
    return this.definitionFetcher.fetchMany(fileSystemId);
  }
}
