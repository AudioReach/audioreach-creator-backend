/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {SubsystemRepository} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

export class TypeOrmSubsystemRepository implements SubsystemRepository {
  constructor(private readonly manager: EntityManager) {}

  async subsystemExists(
    systemId: number,
    fileSystemId: number,
  ): Promise<boolean> {
    const count = await this.manager
      .createQueryBuilder()
      .select('1')
      .from(ENTITY_NAMES.Node, 'n')
      .where(
        'n.systemId = :systemId AND n.fileSystemId = :fileSystemId AND n.type = :type',
        {systemId, fileSystemId, type: 'subsystem'},
      )
      .getCount();
    return count > 0;
  }
}
