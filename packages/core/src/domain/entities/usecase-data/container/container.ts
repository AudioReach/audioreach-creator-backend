/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ContainerPropertyValue} from './value-objects/container-property.js';

export class Container {
  public systemId: number;
  public containerId: number;
  public type: string;
  public fileSystemId: number;

  public properties: Map<number, ContainerPropertyValue>;

  constructor(
    systemId: number,
    containerId: number,
    type: string,
    fileSystemId: number,
  ) {
    this.systemId = systemId;
    this.containerId = containerId;
    this.type = type;
    this.fileSystemId = fileSystemId;

    this.properties = new Map<number, ContainerPropertyValue>();
  }
}
