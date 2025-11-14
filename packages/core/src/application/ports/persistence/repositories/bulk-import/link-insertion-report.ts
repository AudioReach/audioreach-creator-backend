import type {DataLink, ControlLink} from '@arc/core';
import type {NaturalIdMapping, InsertError} from '../../insert-result.js';

/**
 * Link error entity types (combined for data and control links).
 */
export const LINK_ENTITY_TYPES = {
  DATA_LINK: 'DATA_LINK',
  CONTROL_LINK: 'CONTROL_LINK',
} as const;

export type LinkInsertErrorEntity =
  (typeof LINK_ENTITY_TYPES)[keyof typeof LINK_ENTITY_TYPES];

export type DataLinkInsertError = InsertError<'DATA_LINK'>;
export type ControlLinkInsertError = InsertError<'CONTROL_LINK'>;

/**
 * Data link insert result.
 *
 * @example
 * ```typescript
 * const result: DataLinkInsertResult = {
 *   idMapping: { naturalId: "123:output_1->456:input_1", systemId: 789 },
 *   success: true
 * };
 * ```
 */
export interface DataLinkInsertResult {
  /** Composite natural key → systemId */
  idMapping?: NaturalIdMapping<string>;
  error?: DataLinkInsertError;
  success: boolean;
}

export interface BulkDataLinkInsertResult {
  results: DataLinkInsertResult[];
}

/**
 * Control link insert result.
 *
 * @example
 * ```typescript
 * const result: ControlLinkInsertResult = {
 *   idMapping: { naturalId: "123:ctrl_1<->456:ctrl_1", systemId: 790 },
 *   success: true
 * };
 * ```
 */
export interface ControlLinkInsertResult {
  /** Composite natural key → systemId */
  idMapping?: NaturalIdMapping<string>;
  error?: ControlLinkInsertError;
  success: boolean;
}

export interface BulkControlLinkInsertResult {
  results: ControlLinkInsertResult[];
}

/**
 * Builds a natural key for data links using system IDs.
 * Format: "srcNodeSystemId:srcPortSystemId->destNodeSystemId:destPortSystemId"
 *
 * Note: Uses systemIds since links are created after modules have been inserted
 * and have systemIds assigned (topological order insertion).
 *
 * @param link - The data link entity
 * @returns Natural key string for mapping lookups
 *
 * @example
 * ```typescript
 * const link: DataLink = {
 *   sourceNodeSystemId: 123,
 *   sourcePortSystemId: 456,
 *   destinationNodeSystemId: 789,
 *   destinationPortSystemId: 101
 * };
 * const key = buildDataLinkNaturalKey(link); // "123:456->789:101"
 * ```
 */
export function buildDataLinkNaturalKey(link: DataLink): string {
  return `${link.sourceNodeSystemId}:${link.sourcePortSystemId}->${link.destinationNodeSystemId}:${link.destinationPortSystemId}`;
}

/**
 * Builds a natural key for control links using system IDs.
 * Format: "nodeASystemId:portASystemId<->nodeBSystemId:portBSystemId" (normalized to consistent order)
 *
 * Note: Uses systemIds since links are created after modules have been inserted
 * and have systemIds assigned (topological order insertion).
 * Keys are normalized so that the smaller node system ID comes first for consistency.
 *
 * @param link - The control link entity
 * @returns Natural key string for mapping lookups
 *
 * @example
 * ```typescript
 * const link: ControlLink = {
 *   peerNodeASystemId: 456,
 *   nodeAPortSystemId: 789,
 *   peerNodeBSystemId: 123,
 *   nodeBPortSystemId: 101
 * };
 * const key = buildControlLinkNaturalKey(link); // "123:101<->456:789" (normalized)
 * ```
 */
export function buildControlLinkNaturalKey(link: ControlLink): string {
  if (link.peerNodeASystemId < link.peerNodeBSystemId) {
    return `${link.peerNodeASystemId}:${link.nodeAPortSystemId}<->${link.peerNodeBSystemId}:${link.nodeBPortSystemId}`;
  } else {
    return `${link.peerNodeBSystemId}:${link.nodeBPortSystemId}<->${link.peerNodeASystemId}:${link.nodeAPortSystemId}`;
  }
}
