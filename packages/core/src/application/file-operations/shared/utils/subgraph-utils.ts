/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  SUB_GRAPH_PROP_ID_SCENARIO_ID,
  SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL,
} from '../constants/spf-ids.js';
import type {SubgraphPropertyDownloadModel} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

/**
 * Returns true if the subgraph's scenario ID property indicates a voice-call subgraph.
 *
 * A subgraph is voice if it has propertyId === SUB_GRAPH_PROP_ID_SCENARIO_ID and
 * the first byte of the payload equals SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL (0x03).
 *
 * The payload is stored as a little-endian 4-byte integer; reading payload[0] is
 * sufficient because the voice call value (0x03) fits in one byte — equivalent to
 * the SQL approach of unicode(substr(payload, 1, 1)).
 *
 * Subgraphs with no scenario property default to audio (non-voice).
 */
export function isVoiceSubgraph(
  properties: ReadonlyArray<SubgraphPropertyDownloadModel>,
): boolean {
  const scenarioProp = properties.find(
    p => p.propertyId === SUB_GRAPH_PROP_ID_SCENARIO_ID,
  );
  return (
    scenarioProp !== undefined &&
    scenarioProp.payload.length > 0 &&
    scenarioProp.payload[0] === SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL
  );
}
