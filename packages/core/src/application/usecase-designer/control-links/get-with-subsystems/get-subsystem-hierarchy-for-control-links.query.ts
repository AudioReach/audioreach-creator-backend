/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetSubsystemHierarchyForControlLinksQuery extends BaseQuery {
  constructor(
    public readonly peerNodeASystemId: number,
    public readonly peerNodeBSystemId: number,
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
