/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ContainerPropertyValue} from './value-objects/container-property.js';

export class Container {
  public systemId: number;
  public naturalId: number;
  public fileSystemId: number;

  /**
   * System ID of the container type definition in the container_types table.
   * Populated from CONTAINER_PROP_ID_CAPABILITY_LIST during upload (TODO: wire in ContainerBuilder).
   * 0 = not yet resolved (uploaded containers awaiting builder fix).
   */
  public containerTypeSystemId: number;

  public properties: Map<number, ContainerPropertyValue>;

  constructor(
    systemId: number,
    containerId: number,
    containerTypeSystemId: number,
    fileSystemId: number,
  ) {
    this.systemId = systemId;
    this.naturalId = containerId;
    this.containerTypeSystemId = containerTypeSystemId;
    this.fileSystemId = fileSystemId;

    this.properties = new Map<number, ContainerPropertyValue>();
  }
}
