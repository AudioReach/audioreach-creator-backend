/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ReadModelBase} from '../../../../../shared/read-model-base.js';
import type {PortIoType} from '../../../../../../domain/entities/common/enums/port-io-type.js';

export interface DataPortReadModel extends ReadModelBase {
  readonly portId: number;
  readonly name: string;
  readonly portIoType: PortIoType;
  readonly isStatic: boolean;
  readonly totalLinksAtPort: number;
}
