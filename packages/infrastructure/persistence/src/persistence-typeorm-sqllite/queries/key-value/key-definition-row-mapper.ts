/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinitionReadModel} from '@arc/core';
import type {KeyDefinitionRow} from '../../entity-schema/definitions/key-value/key-definition.schema.js';

/**
 * Pure row → read model mapper for KeyDefinitionRow, shared by any query
 * service that embeds key definitions (KeyValueDefQueryService,
 * TagDefinitionQueryService). Kept as a standalone function — not a method
 * on either service — so callers don't need a service instance dependency
 * just to map a row they've already queried and overlaid themselves.
 */
export function toKeyDefinitionReadModel(
  row: KeyDefinitionRow,
): KeyDefinitionReadModel {
  const hasCHeaderAttributes =
    row.enumMember != null ||
    row.enumName != null ||
    row.calKeyEnumMember != null ||
    row.graphKeyEnumMember != null;

  return {
    systemId: row.systemId,
    keyId: row.keyId,
    name: row.name,
    description: row.description,
    isCalibrationKey: row.isCalibrationKey,
    isGraphKey: row.isGraphKey,
    isVoice: row.isVoice,
    isDynamic: row.isDynamic,
    specialityKeyValue: row.specialityKeyValue,
    ...(hasCHeaderAttributes && {
      cHeaderAttributes: {
        enumMember: row.enumMember,
        enumName: row.enumName,
        calKeyEnumMember: row.calKeyEnumMember,
        graphKeyEnumMember: row.graphKeyEnumMember,
      },
    }),
    values: (row.values ?? []).map(v => ({
      systemId: v.systemId,
      valueId: v.valueId,
      name: v.name,
      description: v.description,
      enumMember: v.enumMember,
      specialValue: v.specialValue,
    })),
  };
}
