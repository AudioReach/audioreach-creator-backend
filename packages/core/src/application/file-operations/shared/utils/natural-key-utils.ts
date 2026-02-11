/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Utility functions for creating natural key hashes based on natural IDs
 */

/**
 * Build natural key hash for data links using natural IDs (instanceId + portId)
 * This hash is used for tracking and mapping data links back from repository results
 *
 * Format: "sourceInstanceId:sourcePortId->destinationInstanceId:destinationPortId"
 *
 * @param sourceInstanceId - Source module instance ID (natural ID)
 * @param sourcePortId - Source port ID (natural ID)
 * @param destinationInstanceId - Destination module instance ID (natural ID)
 * @param destinationPortId - Destination port ID (natural ID)
 * @returns Natural key hash string
 */
export function buildDataLinkNaturalKeyHash(
  sourceInstanceId: number,
  sourcePortId: number,
  destinationInstanceId: number,
  destinationPortId: number,
): string {
  return `${sourceInstanceId}:${sourcePortId}->${destinationInstanceId}:${destinationPortId}`;
}

/**
 * Build natural key hash for control links using natural IDs (instanceId + portId)
 * This hash is used for tracking and mapping control links back from repository results
 *
 * Format: "peer1InstanceId:peer1PortId<->peer2InstanceId:peer2PortId" (normalized order)
 *
 * @param peer1InstanceId - Peer 1 module instance ID (natural ID)
 * @param peer1PortId - Peer 1 port ID (natural ID)
 * @param peer2InstanceId - Peer 2 module instance ID (natural ID)
 * @param peer2PortId - Peer 2 port ID (natural ID)
 * @returns Natural key hash string (normalized to consistent order)
 */
export function buildControlLinkNaturalKeyHash(
  peer1InstanceId: number,
  peer1PortId: number,
  peer2InstanceId: number,
  peer2PortId: number,
): string {
  // Normalize order so smaller instance ID comes first for consistency
  if (peer1InstanceId < peer2InstanceId) {
    return `${peer1InstanceId}:${peer1PortId}<->${peer2InstanceId}:${peer2PortId}`;
  } else {
    return `${peer2InstanceId}:${peer2PortId}<->${peer1InstanceId}:${peer1PortId}`;
  }
}
