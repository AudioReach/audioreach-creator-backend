import {
  BulkControlLinkInsertResult,
  ControlLink,
  NaturalIdMapping,
  ControlLinkInsertResult,
} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {BatchInserter, BatchInsertResult} from '../batch-inserter.js';
import {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import {ControlLinkRow} from '../../../entity-schema/index.js';

/**
 * Handles bulk insertion of ControlLink entities.
 *
 * Process:
 * 1. Batch insert all ControlLinks
 * 2. Query back using composite natural key
 * 3. Build results with mappings and errors
 *
 * Uses insert+query pattern with natural keys for reliable systemId mapping.
 */
export class ControlLinkInserter extends BaseInserter<
  Omit<ControlLink, 'systemId'>,
  BulkControlLinkInsertResult,
  'CONTROL_LINK'
> {
  /**
   * Insert ControlLinks in bulk.
   *
   * @param controlLinks - ControlLink domain entities without systemId
   * @returns Bulk insert result with natural key mappings and errors
   */
  async insert(
    controlLinks: readonly Omit<ControlLink, 'systemId'>[],
  ): Promise<BulkControlLinkInsertResult> {
    // Early return for empty input
    if (controlLinks.length === 0) {
      return {
        results: [],
      };
    }

    // ============================================
    // Batch Insert ControlLinks
    // ============================================
    const controlLinkRows = controlLinks.map(cl => this.toControlLinkRow(cl));
    const insertResult = await BatchInserter.insert(
      this.manager,
      'ControlLink',
      controlLinkRows,
    );

    // ============================================
    // Query Back ControlLink SystemIds
    // ============================================
    const successfulNaturalKeys = insertResult.succeeded.map(row =>
      this.buildNaturalKeyFromRow(row),
    );
    const mappings = await this.queryBackControlLinks(successfulNaturalKeys);

    // ============================================
    // Build Results
    // ============================================
    return this.buildResults(controlLinks, mappings, insertResult);
  }

  /**
   * Convert ControlLink domain entity to database row
   */
  private toControlLinkRow(
    controlLink: Omit<ControlLink, 'systemId'>,
  ): QueryDeepPartialEntity<ControlLinkRow> {
    return {
      peerNodeASystemId: controlLink.peerNodeASystemId,
      peerNodeBSystemId: controlLink.peerNodeBSystemId,
      nodeAPortSystemId: controlLink.nodeAPortSystemId,
      nodeBPortSystemId: controlLink.nodeBPortSystemId,
      heapId: controlLink.heapId,
      isInterGraph: controlLink.isInterGraph,
    };
  }

  /**
   * Build natural key from database row (normalized)
   */
  private buildNaturalKeyFromRow(
    row: QueryDeepPartialEntity<ControlLinkRow>,
  ): string {
    const nodeAId = Number(row.peerNodeASystemId);
    const nodeBId = Number(row.peerNodeBSystemId);
    const portAId = Number(row.nodeAPortSystemId);
    const portBId = Number(row.nodeBPortSystemId);

    return nodeAId < nodeBId
      ? `${nodeAId}:${portAId}<->${nodeBId}:${portBId}`
      : `${nodeBId}:${portBId}<->${nodeAId}:${portAId}`;
  }

  /**
   * Query back ControlLink systemIds using natural keys.
   *
   * @param naturalKeys - Array of natural keys to query
   * @returns Array of natural key → systemId mappings
   */
  private async queryBackControlLinks(
    naturalKeys: string[],
  ): Promise<NaturalIdMapping<string>[]> {
    if (naturalKeys.length === 0) return [];

    // Parse natural keys to build query conditions
    const conditions = naturalKeys.map(key => {
      const [nodeA, nodeB] = key.split('<->');
      const [nodeAId, portAId] = nodeA.split(':');
      const [nodeBId, portBId] = nodeB.split(':');
      return {
        nodeASystemId: Number.parseInt(nodeAId),
        portASystemId: Number.parseInt(portAId),
        nodeBSystemId: Number.parseInt(nodeBId),
        portBSystemId: Number.parseInt(portBId),
      };
    });

    const results = [];
    for (const condition of conditions) {
      // Query for both possible orientations since control links are bidirectional
      const result = await this.manager
        .createQueryBuilder('ControlLink', 'cl')
        .select([
          'cl.systemId',
          'cl.peerNodeASystemId',
          'cl.nodeAPortSystemId',
          'cl.peerNodeBSystemId',
          'cl.nodeBPortSystemId',
        ])
        .where(
          '(cl.peerNodeASystemId = :nodeAId AND cl.nodeAPortSystemId = :portAId AND cl.peerNodeBSystemId = :nodeBId AND cl.nodeBPortSystemId = :portBId)',
          {
            nodeAId: condition.nodeASystemId,
            portAId: condition.portASystemId,
            nodeBId: condition.nodeBSystemId,
            portBId: condition.portBSystemId,
          },
        )
        .orWhere(
          '(cl.peerNodeASystemId = :nodeBId AND cl.nodeAPortSystemId = :portBId AND cl.peerNodeBSystemId = :nodeAId AND cl.nodeBPortSystemId = :portAId)',
          {
            nodeAId: condition.nodeASystemId,
            portAId: condition.portASystemId,
            nodeBId: condition.nodeBSystemId,
            portBId: condition.portBSystemId,
          },
        )
        .getOne();

      if (result) {
        const naturalKey = this.buildNaturalKeyFromRow(result);
        results.push({
          naturalId: naturalKey,
          systemId: result.systemId,
        });
      }
    }

    return results;
  }

  /**
   * Build results with mappings and errors
   */
  private buildResults(
    controlLinks: readonly Omit<ControlLink, 'systemId'>[],
    mappings: NaturalIdMapping<string>[],
    insertResult: BatchInsertResult<QueryDeepPartialEntity<ControlLinkRow>>,
  ): BulkControlLinkInsertResult {
    const mappingMap = new Map(mappings.map(m => [m.naturalId, m.systemId]));

    const failedMap = new Map(
      insertResult.failed.map(f => [
        this.buildNaturalKeyFromRow(f.row),
        f.error,
      ]),
    );

    const results: ControlLinkInsertResult[] = [];

    for (const controlLink of controlLinks) {
      // Build normalized natural key
      const naturalKey =
        controlLink.peerNodeASystemId < controlLink.peerNodeBSystemId
          ? `${controlLink.peerNodeASystemId}:${controlLink.nodeAPortSystemId}<->${controlLink.peerNodeBSystemId}:${controlLink.nodeBPortSystemId}`
          : `${controlLink.peerNodeBSystemId}:${controlLink.nodeBPortSystemId}<->${controlLink.peerNodeASystemId}:${controlLink.nodeAPortSystemId}`;

      const systemId = mappingMap.get(naturalKey);
      const error = failedMap.get(naturalKey);

      if (systemId) {
        results.push({
          idMapping: {naturalId: naturalKey, systemId},
          success: true,
        });
      } else if (error) {
        results.push({
          error: this.buildError('CONTROL_LINK', naturalKey, error),
          success: false,
        });
      }
    }

    return {
      results,
    };
  }
}
