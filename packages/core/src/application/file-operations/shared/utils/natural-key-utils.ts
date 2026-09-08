/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Build natural key hash for control links using natural IDs (instanceNaturalId + portNaturalId)
 * This hash is used for tracking and mapping control links back from repository results
 *
 * Format: "peer1InstanceNaturalId:peer1PortNaturalId<->peer2InstanceNaturalId:peer2PortNaturalId" (normalized order)
 *
 * @param peer1InstanceNaturalId - Peer 1 module instance ID (natural ID)
 * @param peer1PortNaturalId - Peer 1 port ID (natural ID)
 * @param peer2InstanceNaturalId - Peer 2 module instance ID (natural ID)
 * @param peer2PortNaturalId - Peer 2 port ID (natural ID)
 * @returns Natural key hash string (normalized to consistent order)
 */
export function buildControlLinkNaturalKeyHash(
  peer1InstanceNaturalId: number,
  peer1PortNaturalId: number,
  peer2InstanceNaturalId: number,
  peer2PortNaturalId: number,
): string {
  // Normalize order so smaller instance ID comes first for consistency
  if (peer1InstanceNaturalId < peer2InstanceNaturalId) {
    return `${peer1InstanceNaturalId}:${peer1PortNaturalId}<->${peer2InstanceNaturalId}:${peer2PortNaturalId}`;
  } else {
    return `${peer2InstanceNaturalId}:${peer2PortNaturalId}<->${peer1InstanceNaturalId}:${peer1PortNaturalId}`;
  }
}
