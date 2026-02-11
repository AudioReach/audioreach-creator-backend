/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  ModuleDefinition,
  type ModuleDefinitionInit,
} from '../../common/entities/module-definition.js';

export class VcpmModuleDefinition extends ModuleDefinition {
  constructor(initParam: ModuleDefinitionInit) {
    super(initParam);
  }
}
