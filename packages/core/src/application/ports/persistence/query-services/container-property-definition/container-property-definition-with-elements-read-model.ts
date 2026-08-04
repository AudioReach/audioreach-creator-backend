/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PropertyDefinitionWithElements} from '../../../../usecase-designer/shared/property-definition-with-elements.js';

/**
 * Read model for a container property definition that includes the binary
 * elements structure required for parsing calibration payloads.
 * Extends `PropertyDefinitionWithElements` which itself extends `PropertyDefinitionReadModel`.
 */
export type ContainerPropertyDefinitionWithElementsReadModel =
  PropertyDefinitionWithElements;
