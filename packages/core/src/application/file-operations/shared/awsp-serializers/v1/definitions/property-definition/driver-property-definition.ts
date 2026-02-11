/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BasePropertyDefinition} from './base-property-definition.js';

/**
 * Represents a driver property definition.
 * Inherits all properties from BasePropertyDefinition without additional properties.
 * Driver properties don't have category information.
 */
export class DriverPropertyDefinition extends BasePropertyDefinition {
  // No additional properties - just inherits base properties
}
