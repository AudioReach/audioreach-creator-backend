/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

export class GetContainerPropertyQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly containerSystemId: number;
  public readonly propertySystemId: number;

  constructor(
    projectId: number,
    containerSystemId: number,
    propertySystemId: number,
    clientId: string,
  ) {
    super(clientId);
    this.projectId = projectId;
    this.containerSystemId = containerSystemId;
    this.propertySystemId = propertySystemId;
  }
}
