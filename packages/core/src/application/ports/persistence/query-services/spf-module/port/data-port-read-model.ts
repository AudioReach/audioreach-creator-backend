/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ReadModelBase} from '../../../../../shared/read-model-base.js';
import type {PortIoType} from '../../../../../../domain/entities/common/enums/port-io-type.js';

export interface SpfDataPortReadModel extends ReadModelBase {
  readonly portId: number; // data_ports.data_port_id (business key)
  readonly name: string;
  readonly portIoType: PortIoType; // uses core domain type: 'Input' | 'Output'
  readonly isStatic: boolean;
  readonly totalLinksAtPort: number; // count of data_links at this port (overlay-aware)
}
