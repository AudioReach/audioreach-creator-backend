/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';
import {invariant} from '../../../../shared/assertions/index.js';
import type {EmittedUsecaseChange} from '../../use-case-creator/contracts/routing-state.js';
import {parseId} from '../../shared/parse-id.js';

export class GetUsecaseChangeDetailsQuery extends BaseQuery {
  public readonly projectId: number;

  constructor(
    projectId: string,
    clientId: string,
    public readonly emittedChanges: readonly EmittedUsecaseChange[],
  ) {
    super(clientId);
    this.projectId = parseId(projectId, 'projectId');
    const systemIds = new Set<number>();
    for (const change of emittedChanges) {
      invariant(
        !systemIds.has(change.systemId),
        `Duplicate emitted usecase systemId: ${change.systemId}`,
      );
      systemIds.add(change.systemId);
    }
  }
}
