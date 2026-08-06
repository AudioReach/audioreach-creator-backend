/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SubsystemDataLinkReadModel} from './subsystem-data-link-read-model.js';
import type {DataPortReadModel} from '../../node/data-port-read-model.js';

export class UseCaseComponentsWithSubsystemsReadModel {
  constructor(
    public readonly subsystemDataLinks: SubsystemDataLinkReadModel[],
    public readonly autoCreatedDataPorts: DataPortReadModel[],
  ) {}
}
