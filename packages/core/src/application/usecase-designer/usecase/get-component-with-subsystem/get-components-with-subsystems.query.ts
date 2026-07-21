/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';
import {COMPONENT_SCOPE_TYPE} from '../get-components/component-scope-type.js';

export type ComponentSubsystemScope = {
  type: typeof COMPONENT_SCOPE_TYPE.Usecase;
  systemIds: number[];
};

export class GetComponentsWithSubsystemsQuery extends BaseQuery {
  constructor(
    public readonly scope: ComponentSubsystemScope,
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
