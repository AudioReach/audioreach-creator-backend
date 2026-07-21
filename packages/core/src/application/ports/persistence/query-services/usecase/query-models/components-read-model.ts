/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleReadModel} from '../../spf-module/spf-module-read-model.js';
import type {DataLinkReadModel} from '../../link/data-link-read-model.js';
import type {ControlLinkReadModel} from '../../link/control-link-read-model.js';

export interface ComponentsReadModel {
  readonly modules: SpfModuleReadModel[];
  readonly dataLinks: DataLinkReadModel[];
  readonly controlLinks: ControlLinkReadModel[];
}
