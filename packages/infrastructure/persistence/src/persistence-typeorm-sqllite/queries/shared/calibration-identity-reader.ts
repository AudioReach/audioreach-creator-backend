/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {
  ENTITY_TYPE,
  FAILED_ENTITY_REASON,
  type BatchRead,
  type EntityRef,
  type FailedEntity,
  type IdentifiedEntityRef,
  type NamedKeyValue,
  type NamedNaturalId,
} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {DbKeyValueDefQueryService} from '../key-value/db-key-value-def-query-service.js';
import {DbTagDefinitionQueryService} from '../tag-definition/db-tag-definition-query-service.js';
import {NodeIdentityReader} from './node-identity-reader.js';
import {CkvOverlayFetcher} from '../../fetchers/ckv-overlay-fetcher.js';
import {CkvParameterPayloadFetcher} from '../../fetchers/ckv-parameter-payload-fetcher.js';
import {TkvOverlayFetcher} from '../../fetchers/tkv-overlay-fetcher.js';
import {TkvParameterPayloadFetcher} from '../../fetchers/tkv-parameter-payload-fetcher.js';
import {withNotFound} from '../../utils/with-not-found.js';
import {inRequestOrder} from '../../utils/in-request-order.js';

type CkvRef = IdentifiedEntityRef<typeof ENTITY_TYPE.Ckv>;
type TagRef = IdentifiedEntityRef<typeof ENTITY_TYPE.Tag>;
type TkvRef = IdentifiedEntityRef<typeof ENTITY_TYPE.Tkv>;
type ModuleRef = IdentifiedEntityRef<typeof ENTITY_TYPE.SpfModule>;

/**
 * Identity reads of the calibration data of SPF modules (CKVs, module tags,
 * and TKVs), with the session overlay applied. The module query service and
 * the module repository share it, so each identity is built in one place.
 * The caller passes the session it reads in.
 *
 * Values and tag definitions are named through their own identity reads,
 * so ones deleted in the session are named from committed data as well.
 */
export class CalibrationIdentityReader {
  private readonly ckvFetcher: CkvOverlayFetcher;
  private readonly tkvFetcher: TkvOverlayFetcher;
  private readonly nodeIdentities: NodeIdentityReader;
  private readonly keyValueDefs: DbKeyValueDefQueryService;
  private readonly tagDefinitions: DbTagDefinitionQueryService;

  constructor(manager: EntityManager, editActions: EditActionsQueryService) {
    this.ckvFetcher = new CkvOverlayFetcher(
      manager,
      editActions,
      new CkvParameterPayloadFetcher(manager, editActions),
    );
    this.tkvFetcher = new TkvOverlayFetcher(
      manager,
      editActions,
      new TkvParameterPayloadFetcher(manager, editActions),
    );
    this.nodeIdentities = new NodeIdentityReader(manager, editActions);
    this.keyValueDefs = new DbKeyValueDefQueryService(manager, editActions);
    this.tagDefinitions = new DbTagDefinitionQueryService(
      manager,
      editActions,
      this.keyValueDefs,
    );
  }

  /**
   * The module and values of each CKV. A CKV whose module or a value
   * definition is missing is `UNRESOLVED_REFERENCE`, without identity.
   */
  async readCkvs(
    fileSystemId: number,
    sessionId: number | null,
    ckvSystemIds: readonly number[],
  ): Promise<BatchRead<CkvRef, typeof ENTITY_TYPE.Ckv>> {
    const requested = [...new Set(ckvSystemIds)];
    const ckvs = await this.ckvFetcher.fetchBySystemIds(
      requested,
      fileSystemId,
      sessionId,
    );
    const [modules, values] = await Promise.all([
      this.readModules(
        fileSystemId,
        sessionId,
        ckvs.map(ckv => ckv.spfModuleSystemId),
      ),
      this.readValues(
        fileSystemId,
        ckvs.flatMap(ckv => ckv.values.map(value => value.valueDefSystemId)),
      ),
    ]);

    const items: CkvRef[] = [];
    const failed: FailedEntity<typeof ENTITY_TYPE.Ckv>[] = [];
    for (const ckv of ckvs) {
      const valueIds = ckv.values.map(value => value.valueDefSystemId);
      const module = modules.get(ckv.spfModuleSystemId);
      if (module === undefined) {
        failed.push(unresolved(ckv.systemId, moduleRef(ckv.spfModuleSystemId)));
        continue;
      }
      const missingValue = missingValueRef(valueIds, values);
      if (missingValue !== undefined) {
        failed.push(unresolved(ckv.systemId, missingValue));
        continue;
      }
      items.push({
        entityType: ENTITY_TYPE.Ckv,
        systemId: ckv.systemId,
        identity: {module, values: pairsOf(valueIds, values)},
      });
    }
    return withNotFound(
      ENTITY_TYPE.Ckv,
      requested,
      inRequestOrder(requested, items),
      item => item.systemId,
      failed,
    );
  }

  /**
   * The module and tag definition of each module tag. A tag whose module
   * or tag definition is missing is `UNRESOLVED_REFERENCE`, without
   * identity.
   */
  async readTags(
    fileSystemId: number,
    sessionId: number | null,
    tagSystemIds: readonly number[],
  ): Promise<BatchRead<TagRef, typeof ENTITY_TYPE.Tag>> {
    const requested = [...new Set(tagSystemIds)];
    const tagMaps = await this.tkvFetcher.fetchTagMapsBySystemIds(
      requested,
      fileSystemId,
      sessionId,
    );
    const [modules, tagDefinitions] = await Promise.all([
      this.readModules(
        fileSystemId,
        sessionId,
        tagMaps.map(tagMap => tagMap.spfModuleSystemId),
      ),
      this.readTagDefinitions(
        fileSystemId,
        tagMaps.map(tagMap => tagMap.tagDefinitionSystemId),
      ),
    ]);

    const items: TagRef[] = [];
    const failed: FailedEntity<typeof ENTITY_TYPE.Tag>[] = [];
    for (const tagMap of tagMaps) {
      const module = modules.get(tagMap.spfModuleSystemId);
      const tag = tagDefinitions.get(tagMap.tagDefinitionSystemId);
      if (module === undefined) {
        failed.push(
          unresolved(tagMap.systemId, moduleRef(tagMap.spfModuleSystemId)),
        );
      } else if (tag === undefined) {
        failed.push(
          unresolved(
            tagMap.systemId,
            tagDefinitionRef(tagMap.tagDefinitionSystemId),
          ),
        );
      } else {
        items.push({
          entityType: ENTITY_TYPE.Tag,
          systemId: tagMap.systemId,
          identity: {module, tag},
        });
      }
    }
    return withNotFound(
      ENTITY_TYPE.Tag,
      requested,
      inRequestOrder(requested, items),
      item => item.systemId,
      failed,
    );
  }

  /**
   * The module, tag definition, and values of each TKV. A TKV whose module
   * tag, module, tag definition, or a value definition is missing is
   * `UNRESOLVED_REFERENCE`, without identity.
   */
  async readTkvs(
    fileSystemId: number,
    sessionId: number | null,
    tkvSystemIds: readonly number[],
  ): Promise<BatchRead<TkvRef, typeof ENTITY_TYPE.Tkv>> {
    const requested = [...new Set(tkvSystemIds)];
    const tkvs = await this.tkvFetcher.fetchTkvsBySystemIds(
      requested,
      fileSystemId,
      sessionId,
    );
    const [tags, values] = await Promise.all([
      this.readTags(
        fileSystemId,
        sessionId,
        tkvs.map(tkv => tkv.moduleTagIdMapSystemId),
      ),
      this.readValues(
        fileSystemId,
        tkvs.flatMap(tkv => tkv.values.map(value => value.valueDefSystemId)),
      ),
    ]);
    const tagsById = new Map(tags.items.map(tag => [tag.systemId, tag]));
    const tagFailures = new Map(
      tags.failed.map(failure => [failure.systemId, failure]),
    );

    const items: TkvRef[] = [];
    const failed: FailedEntity<typeof ENTITY_TYPE.Tkv>[] = [];
    for (const tkv of tkvs) {
      const valueIds = tkv.values.map(value => value.valueDefSystemId);
      const tag = tagsById.get(tkv.moduleTagIdMapSystemId);
      if (tag === undefined) {
        // The tag's own missing reference, or the tag itself if not found.
        const missingRef =
          tagFailures.get(tkv.moduleTagIdMapSystemId)?.missingRef ??
          tagRef(tkv.moduleTagIdMapSystemId);
        failed.push(unresolved(tkv.systemId, missingRef));
        continue;
      }
      const missingValue = missingValueRef(valueIds, values);
      if (missingValue !== undefined) {
        failed.push(unresolved(tkv.systemId, missingValue));
        continue;
      }
      items.push({
        entityType: ENTITY_TYPE.Tkv,
        systemId: tkv.systemId,
        identity: {
          module: tag.identity.module,
          tag: tag.identity.tag,
          values: pairsOf(valueIds, values),
        },
      });
    }
    return withNotFound(
      ENTITY_TYPE.Tkv,
      requested,
      inRequestOrder(requested, items),
      item => item.systemId,
      failed,
    );
  }

  private async readModules(
    fileSystemId: number,
    sessionId: number | null,
    moduleSystemIds: readonly number[],
  ): Promise<Map<number, ModuleRef>> {
    const modules = await this.nodeIdentities.readSpfModules(
      fileSystemId,
      sessionId,
      moduleSystemIds,
    );
    return new Map(modules.items.map(module => [module.systemId, module]));
  }

  private async readValues(
    fileSystemId: number,
    valueDefSystemIds: readonly number[],
  ): Promise<Map<number, NamedKeyValue>> {
    const values = await this.keyValueDefs.findValueDefinitionIdentities(
      fileSystemId,
      valueDefSystemIds,
    );
    return new Map(values.items.map(value => [value.systemId, value.identity]));
  }

  private async readTagDefinitions(
    fileSystemId: number,
    tagDefinitionSystemIds: readonly number[],
  ): Promise<Map<number, NamedNaturalId>> {
    const tags = await this.tagDefinitions.findTagDefinitionIdentities(
      fileSystemId,
      tagDefinitionSystemIds,
    );
    return new Map(tags.items.map(tag => [tag.systemId, tag.identity]));
  }
}

type CalibrationEntityType =
  | typeof ENTITY_TYPE.Ckv
  | typeof ENTITY_TYPE.Tag
  | typeof ENTITY_TYPE.Tkv;

function unresolved<E extends CalibrationEntityType>(
  systemId: number,
  missingRef: EntityRef,
): FailedEntity<E> {
  return {
    systemId,
    reason: FAILED_ENTITY_REASON.UnresolvedReference,
    missingRef,
  };
}

function missingValueRef(
  valueDefSystemIds: readonly number[],
  values: ReadonlyMap<number, NamedKeyValue>,
): EntityRef | undefined {
  const missing = valueDefSystemIds.find(id => !values.has(id));
  return missing === undefined
    ? undefined
    : {entityType: ENTITY_TYPE.ValueDefinition, systemId: missing};
}

/** The pairs of the given values, in the order of the key vector. */
function pairsOf(
  valueDefSystemIds: readonly number[],
  values: ReadonlyMap<number, NamedKeyValue>,
): NamedKeyValue[] {
  return valueDefSystemIds.flatMap(id => {
    const pair = values.get(id);
    return pair === undefined ? [] : [pair];
  });
}

function moduleRef(systemId: number): EntityRef {
  return {entityType: ENTITY_TYPE.SpfModule, systemId};
}

function tagRef(systemId: number): EntityRef {
  return {entityType: ENTITY_TYPE.Tag, systemId};
}

function tagDefinitionRef(systemId: number): EntityRef {
  return {entityType: ENTITY_TYPE.TagDefinition, systemId};
}
