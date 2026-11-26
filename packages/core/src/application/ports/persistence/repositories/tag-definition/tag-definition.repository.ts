/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {TagDefinitionQueryService} from '../../query-services/tag-definition/tag-definition-query-service.js';

/**
 * Tag definition access inside a command's transaction. Reads come from the query
 * service; write methods belong here once commands change them.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Write methods are added when commands change them
export interface TagDefinitionRepository extends TagDefinitionQueryService {}
