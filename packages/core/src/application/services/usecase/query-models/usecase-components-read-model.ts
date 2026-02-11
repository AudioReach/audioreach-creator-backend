/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ModuleReadModel} from './module-read-model.js';
import type {DataLinkReadModel} from './data-link-read-model.js';
import type {ControlLinkReadModel} from './control-link-read-model.js';

export class UseCaseComponentsReadModel {
  constructor(
    public readonly modules: ModuleReadModel[],
    public readonly dataLinks: DataLinkReadModel[],
    public readonly controlLinks: ControlLinkReadModel[],
  ) {}
}
