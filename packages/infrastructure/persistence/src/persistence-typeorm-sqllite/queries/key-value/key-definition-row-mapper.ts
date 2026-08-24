/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinitionReadModel} from '@arc/core';
import type {OverlaidKeyDefinition} from '../../fetchers/definitions/key-value/key-value-definition-fetcher.js';

/**
 * Pure overlaid-row → read model mapper for KeyDefinition, shared by any
 * query service that embeds key definitions (KeyValueDefQueryService,
 * TagDefinitionQueryService). Accepts OverlaidKeyDefinition (from
 * KeyValueDefinitionFetcher) rather than the TypeORM KeyDefinitionRow so it
 * works with the overlay result directly — no DB audit fields needed.
 *
 * Kept as a standalone function — not a method on either service — so callers
 * don't need a service instance dependency just to map a row they've already
 * fetched and overlaid.
 */
export function toKeyDefinitionReadModel(
  row: OverlaidKeyDefinition,
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
