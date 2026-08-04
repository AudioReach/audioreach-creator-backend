/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve all property values for a specific container instance,
 * with session overlay applied and binary payloads parsed to `ElementData[]`.
 *
 * Dispatched by `ContainerController.getContainerProperties` and handled by
 * `GetContainerPropertiesHandler`.
 */
export class GetContainerPropertiesQuery extends BaseQuery {
  public readonly projectId: number;
  public readonly containerSystemId: number;

  constructor(projectId: number, containerSystemId: number, clientId: string) {
    super(clientId);
    this.projectId = projectId;
    this.containerSystemId = containerSystemId;
  }
}
