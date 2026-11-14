/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyValueDefQueryService} from '../../query-services/key-value/key-value-definition-query-service.js';

/**
 * Key and value definition access inside a command's transaction. Reads
 * come from the query service; write methods belong here once commands
 * add keys or values.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Write methods are added when commands change key/value definitions
export interface KeyValueDefinitionRepository extends KeyValueDefQueryService {}
