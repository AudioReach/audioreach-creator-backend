/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Reduced projection of KeyDefinition — identity fields only.
 * Extracted from KeyDefinitionReadModel via project().
 */
export interface KeyDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly keyId: number;
  readonly name: string;
  readonly description?: string;
}

/**
 * Reduced projection of ValueDefinition — identity fields only.
 * Extracted from ValueDefinitionReadModel via project().
 */
export interface ValueDefinitionSummaryReadModel {
  readonly systemId: number;
  readonly valueId: number;
  readonly name: string;
  readonly description?: string;
}

/**
 * C-header enum attributes for a key definition — grouped separately from
 * the rest of KeyDefinitionReadModel since they're all sourced from the
 * same concern (pseudo header file generation), mirroring the domain
 * entity's CHeaderAttributes grouping. This is a read-side type, not a
 * re-export of the domain type — kept independent so ingestion-side
 * changes to the domain entity don't silently change the query/read shape.
 */
export interface CHeaderAttributesReadModel {
  readonly enumMember?: string;
  readonly enumName?: string;
  readonly calKeyEnumMember?: string;
  readonly graphKeyEnumMember?: string;
}

/**
 * Full projection of the KeyDefinition domain entity (arc_keys table).
 */
export interface KeyDefinitionReadModel extends KeyDefinitionSummaryReadModel {
  readonly isCalibrationKey?: boolean;
  readonly isGraphKey?: boolean;
  readonly isVoice?: boolean;
  readonly isDynamic?: boolean;
  readonly specialityKeyValue?: string;
  readonly cHeaderAttributes?: CHeaderAttributesReadModel;
  readonly values: ValueDefinitionReadModel[];
}

/**
 * Full projection of the ValueDefinition domain entity (arc_values table).
 */
export interface ValueDefinitionReadModel extends ValueDefinitionSummaryReadModel {
  readonly enumMember?: string;
  readonly specialValue?: string;
}
