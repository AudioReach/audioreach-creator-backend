/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';
import {COMPONENT_SCOPE_TYPE} from './component-scope-type.js';

export type ComponentFlatScope =
  | {type: typeof COMPONENT_SCOPE_TYPE.Usecase; systemIds: number[]}
  | {type: typeof COMPONENT_SCOPE_TYPE.Subgraph; systemId: number};

export class GetComponentsQuery extends BaseQuery {
  constructor(
    public readonly scope: ComponentFlatScope,
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}

// Keep for type narrowing in switch

export {COMPONENT_SCOPE_TYPE} from './component-scope-type.js';
