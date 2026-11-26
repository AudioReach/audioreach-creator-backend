/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  EntityIdentityMap,
  EntityRef,
  IdentifiedEntityRef,
} from '../../domain/identity/entity-identity.js';
import type {IssueFactCode} from '../../domain/issues/issue-context-map.js';
import type {IssueFact} from '../../domain/issues/issue-fact.js';
import type {EntityType} from '../../shared/entity-type.js';
import type {BatchRead, FailedEntity} from '../ports/persistence/batch-read.js';
import type {QueryServices} from '../ports/persistence/query-services/query-services.js';
import type {UnitOfWork} from '../ports/persistence/unit-of-work.js';
import {IdentityFormatter} from './identity-formatter.js';
import type {Issue, RenderedEntityRef} from './issue.js';
import {
  FIX_OPTION_TEMPLATES,
  MESSAGE_TEMPLATES,
  type FixOptionCode,
} from './issue-templates.js';

/** Reads the identities of entities of type `E` in one file. */
export type IdentityRead<E extends keyof EntityIdentityMap> = (
  fileSystemId: number,
  systemIds: readonly number[],
) => Promise<BatchRead<IdentifiedEntityRef<E>, E>>;

/**
 * The identity read of each entity type. A type without a read is named by
 * the systemId fallback.
 */
export type IdentityReads = {
  readonly [E in keyof EntityIdentityMap]?: IdentityRead<E>;
};

/** An identity read with its entity type erased, so it can be looked up by any type. */
type AnyIdentityRead = (
  fileSystemId: number,
  systemIds: readonly number[],
) => Promise<{
  readonly entityType: EntityType;
  readonly items: readonly EntityRef[];
  readonly failed: readonly FailedEntity[];
}>;

/** The identity reads of a command's unit of work; they see the session overlay. */
function unitOfWorkReads(uow: UnitOfWork): IdentityReads {
  return {
    UseCase: (fileId, ids) =>
      uow.getUsecaseRepository().findUseCaseIdentities(fileId, ids),
    Subgraph: (fileId, ids) =>
      uow.getSubgraphRepository().findSubgraphIdentities(fileId, ids),
    SpfModule: (fileId, ids) =>
      uow.getModuleRepository().findSpfModuleIdentities(fileId, ids),
    Container: (fileId, ids) =>
      uow.getContainerRepository().findContainerIdentities(fileId, ids),
    Subsystem: (fileId, ids) =>
      uow.getSubsystemRepository().findSubsystemIdentities(fileId, ids),
    DataPort: (fileId, ids) =>
      uow.getModuleRepository().findDataPortIdentities(fileId, ids),
    ControlPort: (fileId, ids) =>
      uow.getModuleRepository().findControlPortIdentities(fileId, ids),
    DataLink: (fileId, ids) =>
      uow.getDataLinkRepository().findDataLinkIdentities(fileId, ids),
    ControlLink: (fileId, ids) =>
      uow.getControlLinkRepository().findControlLinkIdentities(fileId, ids),
    Ckv: (fileId, ids) =>
      uow.getModuleRepository().findCkvIdentities(fileId, ids),
    Tag: (fileId, ids) =>
      uow.getModuleRepository().findTagIdentities(fileId, ids),
    Tkv: (fileId, ids) =>
      uow.getModuleRepository().findTkvIdentities(fileId, ids),
    KeyDefinition: (fileId, ids) =>
      uow
        .getKeyValueDefinitionRepository()
        .findKeyDefinitionIdentities(fileId, ids),
    ValueDefinition: (fileId, ids) =>
      uow
        .getKeyValueDefinitionRepository()
        .findValueDefinitionIdentities(fileId, ids),
    TagDefinition: (fileId, ids) =>
      uow.getTagDefinitionRepository().findTagDefinitionIdentities(fileId, ids),
    SpfModuleDefinition: (fileId, ids) =>
      uow
        .getModuleDefinitionRepository()
        .findSpfModuleDefinitionIdentities(fileId, ids),
    SpfModuleParameterDefinition: (fileId, ids) =>
      uow
        .getModuleDefinitionRepository()
        .findSpfModuleParameterDefinitionIdentities(fileId, ids),
  };
}

/**
 * The identity reads of the query services, for handlers without a unit of
 * work. They see the active session of the file. Modules and subsystems have
 * no query-service read yet (Q1, Q2), so they are named by the systemId
 * fallback.
 */
function queryServiceReads(qs: QueryServices): IdentityReads {
  return {
    UseCase: (fileId, ids) =>
      qs.useCaseQueryService.findUseCaseIdentities(fileId, ids),
    Subgraph: (fileId, ids) =>
      qs.subgraphQueryService.findSubgraphIdentities(fileId, ids),
    Container: (fileId, ids) =>
      qs.containerQueryService.findContainerIdentities(fileId, ids),
    DataPort: (fileId, ids) =>
      qs.nodeQueryService.findDataPortIdentities(fileId, ids),
    ControlPort: (fileId, ids) =>
      qs.nodeQueryService.findControlPortIdentities(fileId, ids),
    DataLink: (fileId, ids) =>
      qs.dataLinkQueryService.findDataLinkIdentities(fileId, ids),
    ControlLink: (fileId, ids) =>
      qs.controlLinkQueryService.findControlLinkIdentities(fileId, ids),
    Ckv: (fileId, ids) =>
      qs.spfModuleQueryService.findCkvIdentities(fileId, ids),
    Tag: (fileId, ids) =>
      qs.spfModuleQueryService.findTagIdentities(fileId, ids),
    Tkv: (fileId, ids) =>
      qs.spfModuleQueryService.findTkvIdentities(fileId, ids),
    KeyDefinition: (fileId, ids) =>
      qs.keyValueDefQueryService.findKeyDefinitionIdentities(fileId, ids),
    ValueDefinition: (fileId, ids) =>
      qs.keyValueDefQueryService.findValueDefinitionIdentities(fileId, ids),
    TagDefinition: (fileId, ids) =>
      qs.tagDefinitionQueryService.findTagDefinitionIdentities(fileId, ids),
    SpfModuleDefinition: (fileId, ids) =>
      qs.spfModuleDefinitionQueryService.findSpfModuleDefinitionIdentities(
        fileId,
        ids,
      ),
    SpfModuleParameterDefinition: (fileId, ids) =>
      qs.spfModuleDefinitionQueryService.findSpfModuleParameterDefinitionIdentities(
        fileId,
        ids,
      ),
  };
}

const formatter = new IdentityFormatter();

/**
 * Turns issue facts into issues people can read.
 *
 * It reads the identity of every referenced entity that has none, with one
 * batched read per entity type, then writes each message and fix-option
 * description from its template. A deleted entity is named by the identity
 * its read returns with the failure; an entity that is still unknown is
 * named as `<label> with systemId: 0x...`. A command renders inside its unit of
 * work, before commit or rollback.
 */
export class IssueRenderer {
  constructor(
    private readonly reads: IdentityReads,
    private readonly fileSystemId: number,
  ) {}

  /** A renderer that reads through the repositories of `uow`. */
  static forUnitOfWork(uow: UnitOfWork): IssueRenderer {
    return new IssueRenderer(
      unitOfWorkReads(uow),
      uow.getWriteContext().session.fileSystemId,
    );
  }

  /** A renderer that reads through the query services, for query handlers. */
  static forQueryServices(
    qs: QueryServices,
    fileSystemId: number,
  ): IssueRenderer {
    return new IssueRenderer(queryServiceReads(qs), fileSystemId);
  }

  /**
   * Renders `facts` without reading: each reference is named by its own
   * identity, or by the systemId fallback. For producers that already have
   * every identity they can know, such as the failures of a batch read.
   */
  static renderWithoutReads<C extends IssueFactCode>(
    facts: readonly IssueFact<C>[],
  ): Issue<C>[] {
    const renderRef = refRenderer(new Map());
    return facts.map(fact => renderFact(fact, renderRef));
  }

  async render<C extends IssueFactCode>(
    facts: readonly IssueFact<C>[],
  ): Promise<Issue<C>[]> {
    if (facts.length === 0) return [];

    // 1. Find the references whose producer did not supply an identity.
    const missing = collectRefsWithoutIdentity(facts);
    // 2. Read those identities, with one batched read per entity type.
    const found = await this.readIdentities(missing);
    // 3. Build the function that gives each reference its display name.
    const renderRef = refRenderer(found);
    // 4. Write each issue's message and fix-option descriptions.
    return facts.map(fact => renderFact(fact, renderRef));
  }

  /**
   * The read identities by `refKey`, with one read per entity type: found
   * entities, and failed ones whose identity is known (deleted entities).
   */
  private async readIdentities(
    refs: readonly EntityRef[],
  ): Promise<ReadonlyMap<string, EntityRef>> {
    // Erase the per-type read signatures so a read can be looked up by a
    // runtime `entityType`. Every read returns the same result shape.
    const reads: Partial<Record<EntityType, AnyIdentityRead>> = this.reads;

    // Group the systemIds by entity type, keeping each type's read with its
    // IDs. The Set drops an ID referenced more than once. A type without a
    // read is skipped; its references get the systemId fallback.
    const groups = new Map<
      EntityType,
      {read: AnyIdentityRead; ids: Set<number>}
    >();
    for (const {entityType, systemId} of refs) {
      const read = reads[entityType];
      if (read === undefined) continue;

      let group = groups.get(entityType);
      if (group === undefined) {
        group = {read, ids: new Set<number>()};
        groups.set(entityType, group);
      }
      group.ids.add(systemId);
    }

    // Run the reads of all entity types at the same time.
    const results = await Promise.all(
      [...groups.values()].map(({read, ids}) =>
        read(this.fileSystemId, [...ids]),
      ),
    );

    // Index every known identity by `refKey`. The key includes the entity
    // type because entities of different types can share a systemId.
    const found = new Map<string, EntityRef>();
    for (const {entityType, items, failed} of results) {
      for (const item of items) {
        found.set(refKey(entityType, item.systemId), item);
      }

      // A deleted entity fails the read but can still return its identity.
      for (const {systemId, identity} of failed) {
        if (identity === undefined) continue;
        found.set(refKey(entityType, systemId), {
          entityType,
          systemId,
          identity,
        } as EntityRef);
      }
    }
    return found;
  }
}

/** The references in `facts` that have no identity, in the order they appear. */
function collectRefsWithoutIdentity<C extends IssueFactCode>(
  facts: readonly IssueFact<C>[],
): EntityRef[] {
  const missing: EntityRef[] = [];
  for (const fact of facts) {
    // `mapRefs` visits every reference. Here it is used only to visit them:
    // the callback returns each reference unchanged, and the copy that
    // `mapRefs` builds is discarded.
    // A generic `IssueFact<C>` does not widen to the `IssueFact` union.
    mapRefs(fact as IssueFact, ref => {
      if (ref.identity === undefined) missing.push(ref);
      return ref;
    });
  }
  return missing;
}

/**
 * A function that renders a reference. It names the reference by the
 * identity read for it when there is one, and otherwise by the reference
 * itself (its own identity, or the systemId fallback).
 */
function refRenderer(
  found: ReadonlyMap<string, EntityRef>,
): (ref: EntityRef) => RenderedEntityRef {
  return ref => ({
    entityType: ref.entityType,
    systemId: ref.systemId,
    displayName: formatter.format(
      found.get(refKey(ref.entityType, ref.systemId)) ?? ref,
    ),
  });
}

function refKey(entityType: EntityType, systemId: number): string {
  return `${entityType}:${systemId}`;
}

/**
 * The rendered issue of `fact`. The template maps are typed per code; the
 * mapped draft is cast to the code's draft type, which it matches by
 * construction (`mapRefs` changes only entity references).
 */
function renderFact<C extends IssueFactCode>(
  fact: IssueFact<C>,
  renderRef: (ref: EntityRef) => RenderedEntityRef,
): Issue<C> {
  // A generic `IssueFact<C>` does not widen to the `IssueFact` union.
  // Render every reference, then split the fix options from the rest: a
  // message template reads the issue without its fix options.
  const {fixOptions, ...draft} = mapRefs(fact as IssueFact, renderRef);

  // Each code has its own template, typed for that code's draft. TypeScript
  // cannot prove that the template picked by a runtime `fact.code` accepts
  // this `draft`, so the cast states it.
  const message = (
    MESSAGE_TEMPLATES[fact.code] as (issue: typeof draft) => string
  )(draft);

  // A fix option's template is picked by the code, then by the option's kind.
  // Only codes with fix-option kinds have templates. The types let any other
  // code have only an empty list, so its missing templates are never read.
  const renderedFixOptions = fixOptions?.map(option => {
    const templates = FIX_OPTION_TEMPLATES[
      fact.code as FixOptionCode
    ] as Readonly<Record<string, (option: unknown) => string>>;
    return {...option, description: templates[option.kind](option)};
  });

  // `...(x && {key: x})` adds `key` only when `x` is present, so an issue
  // without fix options has no `fixOptions` property. The double cast is
  // needed because TypeScript cannot match this object to the per-code
  // `Issue<C>` union.
  return {
    ...draft,
    message,
    ...(renderedFixOptions && {fixOptions: renderedFixOptions}),
  } as unknown as Issue<C>;
}

/**
 * `fact` with every entity reference passed through `mapRef`, and
 * `relatedEntities` and `params` always present.
 */
function mapRefs<R>(fact: IssueFact, mapRef: (ref: EntityRef) => R) {
  // Take out the fields that hold references; `rest` keeps the others
  // (code, severity, ...), which are copied unchanged.
  const {impactedEntity, impactedUsecases, fixOptions, ...rest} = fact;
  return {
    ...rest,
    // These two override the values copied from `rest`.
    relatedEntities: mapRelated(fact.relatedEntities, mapRef),
    params: fact.params ?? {},
    // `...(x && {key: ...})` adds `key` only when `x` is present; when `x` is
    // undefined, spreading it adds nothing.
    ...(impactedEntity && {impactedEntity: mapRef(impactedEntity)}),
    ...(impactedUsecases && {
      impactedUsecases: impactedUsecases.map(ref => mapRef(ref)),
    }),
    ...(fixOptions && {
      // A fix option has its own related entities. Its other fields, such
      // as `commandPayload`, are copied unchanged.
      fixOptions: fixOptions.map(option => ({
        ...option,
        // Type-only: lets a kind of any code be used as a template key.
        kind: option.kind as string,
        relatedEntities: mapRelated(option.relatedEntities, mapRef),
        params: option.params ?? {},
      })),
    }),
  };
}

/** Maps each role: one entity, a list of entities, or a list of groups. */
function mapRelated<R>(
  related: object | undefined,
  mapRef: (ref: EntityRef) => R,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(related ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([role, value]) => [role, mapValue(value, mapRef)]),
  );
}

/**
 * Maps one role value. It calls itself for each array item, and
 * `mapRelated` calls it again for each role of a group, so references at
 * any depth are reached.
 */
function mapValue<R>(value: unknown, mapRef: (ref: EntityRef) => R): unknown {
  if (isEntityRef(value)) return mapRef(value);
  if (Array.isArray(value)) return value.map(item => mapValue(item, mapRef));
  return mapRelated(value as object, mapRef);
}

/** A group has no `entityType`, so this tells a reference from a group. */
function isEntityRef(value: unknown): value is EntityRef {
  return typeof value === 'object' && value !== null && 'entityType' in value;
}
