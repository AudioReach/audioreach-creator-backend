/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {
  ENTITY_TYPE,
  FAILED_ENTITY_REASON,
  NodeType,
  type BatchRead,
  type EntityRef,
  type FailedEntity,
  type IdentifiedEntityRef,
  type LinkEndpoint,
} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {SpfModuleOverlayFetcher} from '../../fetchers/spf-module-overlay-fetcher.js';
import {SpfModuleDefinitionFetcher} from '../../fetchers/definitions/spf-module-definitions/spf-module-definition-fetcher.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {NodeOverlayFetcher} from '../../fetchers/node-overlay-fetcher.js';
import {PortOverlayFetcher} from '../../fetchers/port-overlay-fetcher.js';
import {IntentFetcher} from '../../fetchers/intent-fetcher.js';
import {withNotFound} from '../../utils/with-not-found.js';
import {inRequestOrder} from '../../utils/in-request-order.js';

type SpfModuleRef = IdentifiedEntityRef<typeof ENTITY_TYPE.SpfModule>;
type SubsystemRef = IdentifiedEntityRef<typeof ENTITY_TYPE.Subsystem>;

/** One link endpoint to resolve: the node and the port the link uses. */
export interface EndpointKey {
  readonly nodeSystemId: number;
  readonly portSystemId: number;
}

/**
 * An endpoint whose identity could not be read: the node, its module
 * definition, or the port is missing.
 */
export interface UnresolvedEndpoint {
  readonly missingRef: EntityRef;
}

/**
 * Identity reads of graph nodes (SPF modules and subsystems) and of link
 * endpoints, with the session overlay applied. The module, subsystem, and
 * link reads share it, so each identity is built in one place. The caller
 * passes the session it reads in.
 */
export class NodeIdentityReader {
  private readonly spfModuleFetcher: SpfModuleOverlayFetcher;
  private readonly spfModuleDefinitionFetcher: SpfModuleDefinitionFetcher;
  private readonly subsystemFetcher: SubsystemOverlayFetcher;
  private readonly nodeFetcher: NodeOverlayFetcher;
  private readonly portFetcher: PortOverlayFetcher;

  constructor(manager: EntityManager, editActions: EditActionsQueryService) {
    this.spfModuleFetcher = new SpfModuleOverlayFetcher(manager, editActions);
    this.spfModuleDefinitionFetcher = new SpfModuleDefinitionFetcher(
      manager,
      editActions,
    );
    this.subsystemFetcher = new SubsystemOverlayFetcher(manager, editActions);
    this.nodeFetcher = new NodeOverlayFetcher(manager, editActions);
    this.portFetcher = new PortOverlayFetcher(
      manager,
      editActions,
      new IntentFetcher(manager, editActions),
    );
  }

  /**
   * Alias, definition name, and natural ID of each module. A module whose
   * definition is missing is `UNRESOLVED_REFERENCE`, without identity.
   * Reads the definitions one by one rather than with a SQL join, so that
   * session edits to a definition are seen.
   */
  async readSpfModules(
    fileSystemId: number,
    sessionId: number | null,
    spfModuleSystemIds: readonly number[],
  ): Promise<BatchRead<SpfModuleRef, typeof ENTITY_TYPE.SpfModule>> {
    const requested = [...new Set(spfModuleSystemIds)];
    if (requested.length === 0) {
      return {entityType: ENTITY_TYPE.SpfModule, items: [], failed: []};
    }

    const modules = await this.spfModuleFetcher.fetchMany(
      fileSystemId,
      sessionId,
      {systemId: requested},
    );
    const definitionSystemIds = [
      ...new Set(modules.map(module => module.definitionSystemId)),
    ];
    const definitions = await Promise.all(
      definitionSystemIds.map(definitionSystemId =>
        this.spfModuleDefinitionFetcher.fetchOne(
          definitionSystemId,
          fileSystemId,
          sessionId,
        ),
      ),
    );
    const definitionNames = new Map(
      definitions.flatMap(definition =>
        definition ? [[definition.systemId, definition.name] as const] : [],
      ),
    );

    const items: SpfModuleRef[] = [];
    const failed: FailedEntity<typeof ENTITY_TYPE.SpfModule>[] = [];
    for (const module of modules) {
      const definitionName = definitionNames.get(module.definitionSystemId);
      if (definitionName === undefined) {
        // No identity: without the definition there is no name to show.
        failed.push({
          systemId: module.systemId,
          reason: FAILED_ENTITY_REASON.UnresolvedReference,
          missingRef: {
            entityType: ENTITY_TYPE.SpfModuleDefinition,
            systemId: module.definitionSystemId,
          },
        });
        continue;
      }
      items.push({
        entityType: ENTITY_TYPE.SpfModule,
        systemId: module.systemId,
        identity: {
          // Modules created without an alias store '' (see createModule).
          ...(module.alias ? {alias: module.alias} : {}),
          definitionName,
          naturalId: module.naturalId,
        },
      });
    }
    return withNotFound(
      ENTITY_TYPE.SpfModule,
      requested,
      inRequestOrder(requested, items),
      item => item.systemId,
      failed,
    );
  }

  /** Name and natural ID of each subsystem. */
  async readSubsystems(
    fileSystemId: number,
    sessionId: number | null,
    subsystemSystemIds: readonly number[],
  ): Promise<BatchRead<SubsystemRef, typeof ENTITY_TYPE.Subsystem>> {
    const requested = [...new Set(subsystemSystemIds)];
    if (requested.length === 0) {
      return {entityType: ENTITY_TYPE.Subsystem, items: [], failed: []};
    }

    // The fetcher has no ID filter; a file has few subsystems.
    const rows = await this.subsystemFetcher.fetchAll(fileSystemId, sessionId);
    const items = inRequestOrder(requested, rows).map(row => ({
      entityType: ENTITY_TYPE.Subsystem,
      systemId: row.systemId,
      identity: {
        name: row.name,
        naturalId: requireSubsystemNaturalId(row.systemId, row.subsystemId),
      },
    }));
    return withNotFound(
      ENTITY_TYPE.Subsystem,
      requested,
      items,
      item => item.systemId,
    );
  }

  /**
   * The identity of each link endpoint: its node (module or subsystem, by
   * the node's type) and its data or control port. All endpoints are read
   * in one batch. The result is keyed by `endpointKeyOf`.
   */
  async readEndpoints(
    fileSystemId: number,
    sessionId: number | null,
    portKind: 'data' | 'control',
    endpoints: readonly EndpointKey[],
  ): Promise<Map<string, LinkEndpoint | UnresolvedEndpoint>> {
    const result = new Map<string, LinkEndpoint | UnresolvedEndpoint>();
    if (endpoints.length === 0) return result;

    const nodeSystemIds = [...new Set(endpoints.map(e => e.nodeSystemId))];
    const portSystemIds = [...new Set(endpoints.map(e => e.portSystemId))];
    const nodes = await this.nodeFetcher.fetchMany(
      nodeSystemIds,
      fileSystemId,
      sessionId,
    );
    const subsystemIds = nodes
      .filter(node => node.type === NodeType.Subsystem)
      .map(node => node.systemId);
    const moduleIds = nodes
      .filter(node => node.type === NodeType.Module)
      .map(node => node.systemId);
    const [modules, subsystems, ports] = await Promise.all([
      this.readSpfModules(fileSystemId, sessionId, moduleIds),
      this.readSubsystems(fileSystemId, sessionId, subsystemIds),
      portKind === 'data'
        ? this.portFetcher.fetchDataPortsForNodes(
            nodeSystemIds,
            fileSystemId,
            sessionId,
            {systemId: portSystemIds},
          )
        : this.portFetcher.fetchControlPortsWithIntentsForNodes(
            nodeSystemIds,
            fileSystemId,
            sessionId,
            {systemId: portSystemIds},
          ),
    ]);

    const nodeRefs = new Map<number, SpfModuleRef | SubsystemRef>();
    for (const ref of [...modules.items, ...subsystems.items]) {
      nodeRefs.set(ref.systemId, ref);
    }
    const nodeFailures = new Map<number, EntityRef>();
    for (const failure of modules.failed) {
      nodeFailures.set(
        failure.systemId,
        failure.missingRef ?? {
          entityType: ENTITY_TYPE.SpfModule,
          systemId: failure.systemId,
        },
      );
    }
    for (const failure of subsystems.failed) {
      nodeFailures.set(failure.systemId, {
        entityType: ENTITY_TYPE.Subsystem,
        systemId: failure.systemId,
      });
    }
    const portsById = new Map(ports.map(port => [port.systemId, port]));
    const portEntityType =
      portKind === 'data' ? ENTITY_TYPE.DataPort : ENTITY_TYPE.ControlPort;

    for (const endpoint of endpoints) {
      const key = endpointKeyOf(endpoint);
      const node = nodeRefs.get(endpoint.nodeSystemId);
      const port = portsById.get(endpoint.portSystemId);
      if (node === undefined) {
        result.set(key, {
          // A node with no row has no type; link endpoints are modules.
          missingRef: nodeFailures.get(endpoint.nodeSystemId) ?? {
            entityType: ENTITY_TYPE.SpfModule,
            systemId: endpoint.nodeSystemId,
          },
        });
      } else if (port === undefined || port.nodeSystemId !== node.systemId) {
        result.set(key, {
          missingRef: {
            entityType: portEntityType,
            systemId: endpoint.portSystemId,
          },
        });
      } else {
        result.set(key, {
          node,
          port: {name: port.name ?? null, naturalId: port.naturalId},
        });
      }
    }
    return result;
  }
}

/** The key of an endpoint in the map returned by `readEndpoints`. */
export function endpointKeyOf(endpoint: EndpointKey): string {
  return `${endpoint.nodeSystemId}:${endpoint.portSystemId}`;
}

/**
 * The two endpoints of a link, read from the map returned by
 * `readEndpoints`, or the first endpoint that could not be resolved.
 */
export function pairEndpoints(
  endpoints: ReadonlyMap<string, LinkEndpoint | UnresolvedEndpoint>,
  first: EndpointKey,
  second: EndpointKey,
): readonly [LinkEndpoint, LinkEndpoint] | UnresolvedEndpoint {
  const a = endpoints.get(endpointKeyOf(first));
  const b = endpoints.get(endpointKeyOf(second));
  if (a === undefined || b === undefined) {
    throw new Error('Endpoint was not passed to readEndpoints');
  }
  if (!('node' in a)) return a;
  if (!('node' in b)) return b;
  return [a, b];
}

/** A stored subsystem always has a natural ID; a missing one is a bug. */
export function requireSubsystemNaturalId(
  systemId: number,
  naturalId: number | null | undefined,
): number {
  if (naturalId === null || naturalId === undefined) {
    throw new Error(`Subsystem ${systemId} is missing subsystem_id.`);
  }
  return naturalId;
}
