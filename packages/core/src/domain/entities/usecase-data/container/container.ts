/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ContainerPropertyValue} from './value-objects/container-property.js';

export class Container {
  public systemId: number;
  public naturalId: number;
  public fileSystemId: number;

  public properties: Map<number, ContainerPropertyValue>;

  constructor(systemId: number, containerId: number, fileSystemId: number) {
    this.systemId = systemId;
    this.naturalId = containerId;
    this.fileSystemId = fileSystemId;

    this.properties = new Map<number, ContainerPropertyValue>();
  }
}
