/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {KeyValueDefinitionRepository} from '@arc/core';
import {DbKeyValueDefQueryService} from '../../queries/key-value/db-key-value-def-query-service.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';

/**
 * Key/value definition reads on the unit-of-work manager, so commands see
 * their own uncommitted writes.
 */
export class TypeOrmKeyValueDefinitionRepository
  extends DbKeyValueDefQueryService
  implements KeyValueDefinitionRepository
{
  constructor(manager: EntityManager) {
    super(manager, new EditActionsQueryService(manager));
  }
}
