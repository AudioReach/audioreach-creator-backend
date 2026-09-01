/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParameterDefinitionBase} from '../module/module-definition.repository.js';

export interface VcpmDefinitionWithParameters {
  systemId: number;
  parameters: ParameterDefinitionBase[];
}

export interface VcpmDefinitionRepository {
  getDefinitionWithParameters(
    fileSystemId: number,
  ): Promise<VcpmDefinitionWithParameters | null>;
}
