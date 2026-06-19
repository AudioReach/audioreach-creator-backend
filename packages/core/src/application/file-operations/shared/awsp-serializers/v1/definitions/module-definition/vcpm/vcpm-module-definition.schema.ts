/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseModuleDefinitionSchema} from '../common/base-module-definition.schema.js';

/**
 * Schema for VCPM module definition.
 * Extends BaseModuleDefinition with no additional fields.
 */
export const AwspVcpmModuleDefinitionSchema = BaseModuleDefinitionSchema;

export type AwspVcpmModuleDefinitionType =
  typeof AwspVcpmModuleDefinitionSchema;
