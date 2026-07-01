/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Full projection of the KeyDefinition domain entity (arc_keys table).
 */
export interface KeyDefinitionReadModel {
  readonly systemId: number;
  readonly keyId: number;
  readonly name: string;
  readonly description?: string;
  readonly isCalibrationKey?: boolean;
  readonly isGraphKey?: boolean;
  readonly isVoice?: boolean;
  readonly isDynamic?: boolean;
  readonly cEnumMemberName?: string;
  readonly cEnumName?: string;
  readonly specialityKeyValue?: string;
  readonly calibrationEnumValue?: string;
  readonly graphEnumValue?: string;
}

/**
 * Full projection of the ValueDefinition domain entity (arc_values table).
 */
export interface ValueDefinitionReadModel {
  readonly systemId: number;
  readonly valueId: number;
  readonly name: string;
  readonly description?: string;
  readonly enumValue?: string;
  readonly specialValue?: string;
}

/**
 * Reduced projection of KeyDefinition — identity fields only.
 * Extracted from KeyDefinitionReadModel via project().
 */
export interface KeyReadModel {
  readonly systemId: number;
  readonly keyId: number;
  readonly name: string;
  readonly description?: string;
}

/**
 * Reduced projection of ValueDefinition — identity fields only.
 * Extracted from ValueDefinitionReadModel via project().
 */
export interface ValueReadModel {
  readonly systemId: number;
  readonly valueId: number;
  readonly name: string;
  readonly description?: string;
}
