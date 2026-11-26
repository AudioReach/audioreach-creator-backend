/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {TagDefinitionRepository} from '@arc/core';
import {DbTagDefinitionQueryService} from '../../queries/tag-definition/db-tag-definition-query-service.js';
import {DbKeyValueDefQueryService} from '../../queries/key-value/db-key-value-def-query-service.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';

/**
 * Tag definition reads on the unit-of-work manager, so commands see their
 * own uncommitted writes.
 */
export class TypeOrmTagDefinitionRepository
  extends DbTagDefinitionQueryService
  implements TagDefinitionRepository
{
  constructor(manager: EntityManager) {
    const editActions = new EditActionsQueryService(manager);
    super(
      manager,
      editActions,
      new DbKeyValueDefQueryService(manager, editActions),
    );
  }
}
