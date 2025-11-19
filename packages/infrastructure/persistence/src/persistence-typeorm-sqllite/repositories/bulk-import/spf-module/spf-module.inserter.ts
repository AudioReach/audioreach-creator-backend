import {
  BulkModuleInsertResult,
  MODULE_AGGREGATE_ENTITY_TYPES,
  ModuleInsertError,
  ModuleInsertErrorEntity,
  ModuleInsertResult,
  NaturalIdMapping,
  SpfModule,
} from '@arc/core';
import {BaseInserter} from '../base.inserter.js';
import {
  mapSpfModuleToRow,
  mapNodeToRow,
  mapDataPortsToRows,
  mapControlPortsToRows,
} from './spf-module-entity-mapper.js';
import {BatchInserter, BatchInsertResult} from '../batch-inserter.js';
import {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity.js';
import {
  SpfModuleRow,
  NodeRow,
  DataPortRow,
  ControlPortRow,
} from '../../../entity-schema/index.js';

/**
 * Handles bulk insertion of SpfModule entities with complex 6-step process.
 *
 * Process:
 * 1. Bulk Insert Nodes FIRST (auto-generated systemIds)
 * 2. Map Node systemIds to SpfModules using insertion order
 * 3. Bulk Insert SpfModules using Node systemIds (shared primary key)
 * 4. Bulk Insert all DataPorts across all modules
 * 5. Bulk Insert all ControlPorts across all modules (without intents)
 * 6. Build results with port mappings for link creation
 *
 * Success Criteria: Module success = SpfModule insert success AND Node insert success
 * Natural Keys: SpfModule: instanceId, DataPort: dataPortId, ControlPort: portId
 * Shared Primary Key: SpfModule.systemId = Node.systemId (Node owns the relationship)
 */
export class SpfModuleInserter extends BaseInserter<
  SpfModule,
  BulkModuleInsertResult,
  ModuleInsertErrorEntity
> {
  /**
   * Insert SpfModules and their relationships in bulk.
   *
   * @param spfModules - SpfModule domain entities with instanceId
   * @returns Bulk insert result with instanceId->systemId mappings and port mappings
   */
  async insert(
    spfModules: readonly SpfModule[],
  ): Promise<BulkModuleInsertResult> {
    // Early return for empty input
    if (spfModules.length === 0) {
      return {results: []};
    }

    // ============================================
    // Step 1: Bulk Insert Nodes FIRST (SpfModule depends on Node)
    // ============================================
    const nodeRows = spfModules.map(sm => mapNodeToRow(sm));
    const nodeInsertResult = await BatchInserter.insert(
      this.manager,
      'Node',
      nodeRows,
    );

    // ============================================
    // Step 2: Map Node SystemIds to SpfModules (using insertion order)
    // ============================================
    // Assumption: successful inserts are in the same order as input
    const instanceIdToSystemId = new Map<number, number>();

    for (let i = 0; i < nodeInsertResult.succeeded.length; i++) {
      const nodeRow = nodeInsertResult.succeeded[
        i
      ] as QueryDeepPartialEntity<NodeRow> & {systemId: number};
      const spfModule = spfModules[i];
      if (nodeRow.systemId && spfModule) {
        instanceIdToSystemId.set(spfModule.instanceId, nodeRow.systemId);
      }
    }

    // ============================================
    // Step 3: Bulk Insert SpfModules using Node SystemIds (Shared Primary Key)
    // ============================================
    const spfModuleRowsWithSystemId: QueryDeepPartialEntity<SpfModuleRow>[] =
      [];

    for (const spfModule of spfModules) {
      const nodeSystemId = instanceIdToSystemId.get(spfModule.instanceId);
      if (!nodeSystemId) continue; // Skip if Node insertion failed

      const spfModuleRow = mapSpfModuleToRow(spfModule);
      // Use Node's systemId as SpfModule's systemId (shared primary key)
      (spfModuleRow as any).systemId = nodeSystemId;

      spfModuleRowsWithSystemId.push(spfModuleRow);
    }

    const spfModuleInsertResult =
      spfModuleRowsWithSystemId.length > 0
        ? await BatchInserter.insert(
            this.manager,
            'SpfModule',
            spfModuleRowsWithSystemId,
          )
        : {succeeded: [], failed: []};

    // ============================================
    // Step 4: Bulk Insert All DataPorts
    // ============================================
    const allDataPortRows: Array<{
      row: QueryDeepPartialEntity<DataPortRow>;
      instanceId: number;
      dataPortId: number;
    }> = [];

    for (const spfModule of spfModules) {
      const nodeSystemId = instanceIdToSystemId.get(spfModule.instanceId);
      if (!nodeSystemId) continue;

      const dataPortRows = mapDataPortsToRows(
        spfModule.dataPorts,
        nodeSystemId,
      );
      for (const dataPortRow of dataPortRows) {
        allDataPortRows.push({
          row: dataPortRow,
          instanceId: spfModule.instanceId,
          dataPortId: dataPortRow.dataPortId,
        });
      }
    }

    const dataPortInsertResult =
      allDataPortRows.length > 0
        ? await BatchInserter.insert(
            this.manager,
            'DataPort',
            allDataPortRows.map(dp => dp.row),
          )
        : {succeeded: [], failed: []};

    // ============================================
    // Step 5: Bulk Insert All ControlPorts (without intents)
    // ============================================
    const allControlPortRows: Array<{
      row: QueryDeepPartialEntity<ControlPortRow>;
      instanceId: number;
      portId: number;
    }> = [];

    for (const spfModule of spfModules) {
      const nodeSystemId = instanceIdToSystemId.get(spfModule.instanceId);
      if (!nodeSystemId) continue;

      const controlPortRows = mapControlPortsToRows(
        spfModule.controlPorts,
        nodeSystemId,
      );
      for (const controlPortRow of controlPortRows) {
        allControlPortRows.push({
          row: controlPortRow,
          instanceId: spfModule.instanceId,
          portId: controlPortRow.portId,
        });
      }
    }

    const controlPortInsertResult =
      allControlPortRows.length > 0
        ? await BatchInserter.insert(
            this.manager,
            'ControlPort',
            allControlPortRows.map(cp => cp.row),
          )
        : {succeeded: [], failed: []};

    // ============================================
    // Step 6: Query Back Port SystemIds and Build Results
    // ============================================
    const dataPortMappings = await this.queryBackDataPorts(
      allDataPortRows,
      dataPortInsertResult.succeeded,
    );

    const controlPortMappings = await this.queryBackControlPorts(
      allControlPortRows,
      controlPortInsertResult.succeeded,
    );

    return this.buildResults(
      spfModules,
      instanceIdToSystemId,
      dataPortMappings,
      controlPortMappings,
      spfModuleInsertResult,
      nodeInsertResult,
    );
  }

  /**
   * Query back DataPort systemIds using nodeSystemId for efficient bulk query.
   */
  private async queryBackDataPorts(
    dataPortRowsWithInstanceId: Array<{
      row: QueryDeepPartialEntity<DataPortRow>;
      instanceId: number;
      dataPortId: number;
    }>,
    succeededRows: QueryDeepPartialEntity<DataPortRow>[],
  ): Promise<Array<{mapping: NaturalIdMapping<number>; instanceId: number}>> {
    if (succeededRows.length === 0) return [];

    // Get all unique nodeSystemIds from successful insertions
    const nodeSystemIds = Array.from(
      new Set(
        succeededRows.map(
          row =>
            (row as QueryDeepPartialEntity<DataPortRow>).nodeSystemId as number,
        ),
      ),
    );

    // Bulk query all ports whose nodeSystemId is in the list
    const results = await this.manager
      .createQueryBuilder('DataPort', 'dp')
      .select(['dp.systemId', 'dp.dataPortId', 'dp.nodeSystemId'])
      .where('dp.nodeSystemId IN (:...nodeSystemIds)', {nodeSystemIds})
      .getMany();

    // Build reverse lookup: nodeSystemId → instanceId
    const nodeSystemIdToInstanceId = new Map<number, number>();
    for (const {row, instanceId} of dataPortRowsWithInstanceId) {
      nodeSystemIdToInstanceId.set(
        (row as QueryDeepPartialEntity<DataPortRow>).nodeSystemId as number,
        instanceId,
      );
    }

    const mappings: Array<{
      mapping: NaturalIdMapping<number>;
      instanceId: number;
    }> = [];
    for (const result of results) {
      const instanceId = nodeSystemIdToInstanceId.get(result.nodeSystemId);
      if (instanceId !== undefined) {
        mappings.push({
          mapping: {
            naturalId: result.dataPortId,
            systemId: result.systemId,
          },
          instanceId,
        });
      }
    }

    return mappings;
  }

  /**
   * Query back ControlPort systemIds using nodeSystemId for efficient bulk query.
   */
  private async queryBackControlPorts(
    controlPortRowsWithInstanceId: Array<{
      row: QueryDeepPartialEntity<ControlPortRow>;
      instanceId: number;
      portId: number;
    }>,
    succeededRows: QueryDeepPartialEntity<ControlPortRow>[],
  ): Promise<Array<{mapping: NaturalIdMapping<number>; instanceId: number}>> {
    if (succeededRows.length === 0) return [];

    // Get all unique nodeSystemIds from successful insertions
    const nodeSystemIds = Array.from(
      new Set(
        succeededRows.map(
          row =>
            (row as QueryDeepPartialEntity<ControlPortRow>)
              .nodeSystemId as number,
        ),
      ),
    );

    // Bulk query all ports whose nodeSystemId is in the list
    const results = await this.manager
      .createQueryBuilder('ControlPort', 'cp')
      .select(['cp.systemId', 'cp.portId', 'cp.nodeSystemId'])
      .where('cp.nodeSystemId IN (:...nodeSystemIds)', {nodeSystemIds})
      .getMany();

    // Build reverse lookup: nodeSystemId → instanceId
    const nodeSystemIdToInstanceId = new Map<number, number>();
    for (const {row, instanceId} of controlPortRowsWithInstanceId) {
      nodeSystemIdToInstanceId.set(
        (row as QueryDeepPartialEntity<ControlPortRow>).nodeSystemId as number,
        instanceId,
      );
    }

    const mappings: Array<{
      mapping: NaturalIdMapping<number>;
      instanceId: number;
    }> = [];
    for (const result of results) {
      const instanceId = nodeSystemIdToInstanceId.get(result.nodeSystemId);
      if (instanceId !== undefined) {
        mappings.push({
          mapping: {
            naturalId: result.portId,
            systemId: result.systemId,
          },
          instanceId,
        });
      }
    }

    return mappings;
  }

  /**
   * Build results with O(1) lookups using Maps.
   * Success = SpfModule insert success AND Node insert success.
   */
  private buildResults(
    spfModules: readonly SpfModule[],
    instanceIdToSystemId: Map<number, number>,
    dataPortMappings: Array<{
      mapping: NaturalIdMapping<number>;
      instanceId: number;
    }>,
    controlPortMappings: Array<{
      mapping: NaturalIdMapping<number>;
      instanceId: number;
    }>,
    spfModuleInsertResult: BatchInsertResult<
      QueryDeepPartialEntity<SpfModuleRow>
    >,
    nodeInsertResult: BatchInsertResult<QueryDeepPartialEntity<NodeRow>>,
  ): BulkModuleInsertResult {
    const results: ModuleInsertResult[] = [];

    // Build failure lookup maps
    const failedSpfModuleMap = new Map<number, Error>(
      spfModuleInsertResult.failed.map(f => [
        (f.row as QueryDeepPartialEntity<SpfModuleRow>).instanceId as number,
        f.error,
      ]),
    );

    const failedNodeMap = new Map<number, Error>();
    // Map Node failures back to instanceId using position correlation
    const nodeRowsAttempted = spfModules
      .filter(sm => instanceIdToSystemId.has(sm.instanceId))
      .map(sm => sm.instanceId);

    for (let i = 0; i < nodeInsertResult.failed.length; i++) {
      const failure = nodeInsertResult.failed[i];
      const instanceId = nodeRowsAttempted[i];
      if (instanceId) {
        failedNodeMap.set(instanceId, failure.error);
      }
    }

    // Group port mappings by instanceId
    const dataPortMappingsByInstance = new Map<
      number,
      NaturalIdMapping<number>[]
    >();
    for (const {mapping, instanceId} of dataPortMappings) {
      if (!dataPortMappingsByInstance.has(instanceId)) {
        dataPortMappingsByInstance.set(instanceId, []);
      }
      dataPortMappingsByInstance.get(instanceId)!.push(mapping);
    }

    const controlPortMappingsByInstance = new Map<
      number,
      NaturalIdMapping<number>[]
    >();
    for (const {mapping, instanceId} of controlPortMappings) {
      if (!controlPortMappingsByInstance.has(instanceId)) {
        controlPortMappingsByInstance.set(instanceId, []);
      }
      controlPortMappingsByInstance.get(instanceId)!.push(mapping);
    }

    // Build result for each input SpfModule
    for (const spfModule of spfModules) {
      const spfModuleSystemId = instanceIdToSystemId.get(spfModule.instanceId);
      const errors: ModuleInsertError[] = [];

      // Check for SpfModule failure
      const spfModuleError = failedSpfModuleMap.get(spfModule.instanceId);
      if (spfModuleError) {
        errors.push(
          this.buildError(
            MODULE_AGGREGATE_ENTITY_TYPES.MODULE,
            spfModule.instanceId,
            spfModuleError,
          ),
        );
      }

      // Check for Node failure
      const nodeError = failedNodeMap.get(spfModule.instanceId);
      if (nodeError) {
        errors.push(
          this.buildError(
            MODULE_AGGREGATE_ENTITY_TYPES.MODULE, // Use MODULE for Node errors as they're part of the same aggregate
            spfModule.instanceId,
            nodeError,
          ),
        );
      }

      // Success = SpfModule insert success AND Node insert success
      const success =
        !spfModuleError && !nodeError && spfModuleSystemId !== undefined;

      if (success) {
        results.push({
          moduleIdMapping: {
            naturalId: spfModule.instanceId,
            systemId: spfModuleSystemId!,
          },
          portMappings: {
            dataPorts:
              dataPortMappingsByInstance.get(spfModule.instanceId) || [],
            controlPorts:
              controlPortMappingsByInstance.get(spfModule.instanceId) || [],
          },
          errors,
          success: true,
        });
      } else {
        results.push({
          portMappings: {
            dataPorts: [],
            controlPorts: [],
          },
          errors,
          success: false,
        });
      }
    }

    return {results};
  }
}
