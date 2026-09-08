<!--
  Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
  SPDX-License-Identifier: BSD-3-Clause
-->

# VCPM GET Query-Service Full Design

This document is an explicit SPF-style amendment to:

docs/subgraph-vcpm-data/vcpm-query-service-design-update.md

It covers:

- GET /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/vcpm-ckv
- GET /arc-api/v1/projects/:projectId/subgraphs/:subgraphSystemId/vcpm-ckv/:ckvSystemId/cal-data

The amendment adds a public VcpmParameterDefinitionQueryService so both VCPM
handlers can retrieve parameter metadata directly through a core port, matching
the existing SPF cal-data pattern.

## 1. Public call graph

### 1.1 CKV summary

~~~text
GET /vcpm-ckv
  -> SubgraphController
  -> QueryBus.execute(GetVcpmCkvQuery)
  -> GetVcpmCkvHandler
      -> ProjectQueryService.getFileIdByProjectId
      -> SubgraphQueryService.findPropertyPayloads
      -> VcpmQueryService.getVcpmCkvSummaryBySubgraph
      -> VcpmParameterDefinitionQueryService.getParameterDefinitionsBySystemIds
      -> compose VcpmCkvDto
~~~

### 1.2 CKV calibration data

~~~text
GET /vcpm-ckv/:ckvSystemId/cal-data
  -> SubgraphController
  -> QueryBus.execute(GetVcpmCalDataQuery)
  -> GetVcpmCalDataHandler
      -> ProjectQueryService.getFileIdByProjectId
      -> SubgraphQueryService.findPropertyPayloads
      -> VcpmQueryService.getVcpmCkvCalData
      -> VcpmParameterDefinitionQueryService.getParameterDefinitionsBySystemIds
      -> parse payload elements
      -> compose CkvCalDataDto
~~~

The handlers use only core ports. They never import TypeORM or infrastructure
fetchers.

## 2. Core ports

### 2.1 VCPM read models

File:
packages/core/src/application/ports/persistence/query-services/vcpm/vcpm-read-model.ts

All VCPM persistence read models are kept in this sibling file, rather than
inside either query-service port. This follows the existing query-service
folder convention and allows both VCPM query-service ports to use the same
types without creating a dependency between the ports.

~~~typescript
import type {KeyValueInfoDto} from '../../../../../shared/dto/key-value-info-dto.js';

export interface VcpmCkvReadModel {
  systemId: number;
  values: KeyValueInfoDto[];
}

export interface VcpmParameterPayloadReadModel {
  systemId: number;
  vcpmParameterSystemId: number;
  vcpmCkvSystemId: number;
  payload: Uint8Array | null;
}

export interface VcpmParameterCkvLinkReadModel {
  parameterSystemId: number;
  ckvSystemIds: number[];
}

export interface VcpmCkvSummaryReadModel {
  ckvs: VcpmCkvReadModel[];
  parameterCkvLinks: VcpmParameterCkvLinkReadModel[];
}

export interface VcpmCkvCalDataReadModel {
  ckv: VcpmCkvReadModel;
  payloads: VcpmParameterPayloadReadModel[];
}

export interface VcpmParameterDefinitionReadModel {
  systemId: number;
  paramId: number;
  name: string;
  isReadOnly: boolean;
  elementsStructure: string;
}
~~~

### 2.2 VcpmQueryService

File:
packages/core/src/application/ports/persistence/query-services/vcpm/vcpm-query-service.ts

`VcpmQueryService` exposes exactly two endpoint-oriented aggregate methods. The
aggregate methods return VCPM data needed by the handlers, but they do not
return parameter-definition metadata. Each handler separately calls
`VcpmParameterDefinitionQueryService` and composes the final DTO.

~~~typescript
import type {
  VcpmCkvCalDataReadModel,
  VcpmCkvSummaryReadModel,
} from './vcpm-read-model.js';

export interface VcpmQueryService {
  getVcpmCkvSummaryBySubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmCkvSummaryReadModel>;

  getVcpmCkvCalData(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    paramSystemIds?: number[],
  ): Promise<VcpmCkvCalDataReadModel | null>;
}
~~~

### 2.3 VcpmParameterDefinitionQueryService

File:
packages/core/src/application/ports/persistence/query-services/vcpm/vcpm-parameter-definition-query-service.ts

~~~typescript
import type {VcpmParameterDefinitionReadModel} from './vcpm-read-model.js';

export interface VcpmParameterDefinitionQueryService {
  getParameterDefinitionsBySystemIds(
    paramSystemIds: number[],
    fileSystemId: number,
  ): Promise<VcpmParameterDefinitionReadModel[]>;
}
~~~

This service is VCPM-specific. The SPF module-definition query service cannot
be reused because it queries SpfModuleParameterDefinition and uses SPF
module-definition ownership.

### 2.4 QueryServices

File:
packages/core/src/application/ports/persistence/query-services/query-services.ts

~~~typescript
import type {VcpmParameterDefinitionQueryService} from './vcpm/vcpm-parameter-definition-query-service.js';
import type {VcpmQueryService} from './vcpm/vcpm-query-service.js';

export interface QueryServices {
  // Existing services remain unchanged.
  readonly vcpmQueryService: VcpmQueryService;
  readonly vcpmParameterDefinitionQueryService:
    VcpmParameterDefinitionQueryService;
}
~~~

## 3. Core handlers

### 3.1 GetVcpmCkvHandler

File:
packages/core/src/application/usecase-designer/subgraph/get-vcpm-ckv/get-vcpm-ckv.handler.ts

~~~typescript
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetVcpmCkvQuery} from './get-vcpm-ckv.query.js';
import type {VcpmCkvDto} from '../dto/subgraph-write-result-types.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {ParameterDefinitionMissingError} from '../../../../shared/errors/parameter.errors.js';

export class GetVcpmCkvHandler implements QueryHandler<
  GetVcpmCkvQuery,
  Promise<Result<VcpmCkvDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetVcpmCkvQuery): Promise<Result<VcpmCkvDto>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );
    const subgraphResult =
      await this.queryServices.subgraphQueryService.findPropertyPayloads(
        query.subgraphSystemId,
        fileSystemId,
      );
    if (subgraphResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        'Subgraph ' + query.subgraphSystemId + ' not found',
        subgraphResult.issues,
      );
    }
    if (subgraphResult.data === null) {
      throw new ResourceNotFoundException(
        'Subgraph ' + query.subgraphSystemId + ' not found',
      );
    }

    const summary =
      await this.queryServices.vcpmQueryService.getVcpmCkvSummaryBySubgraph(
        query.subgraphSystemId,
        fileSystemId,
      );
    const paramSystemIds = [
      ...new Set(
        summary.parameterCkvLinks.map(link => link.parameterSystemId),
      ),
    ];
    if (paramSystemIds.length === 0) {
      return Result.ok({configuredParams: []});
    }

    const definitions =
      await this.queryServices.vcpmParameterDefinitionQueryService
        .getParameterDefinitionsBySystemIds(paramSystemIds, fileSystemId);
    const definitionById = new Map(
      definitions.map(definition => [definition.systemId, definition]),
    );
    const ckvById = new Map(summary.ckvs.map(ckv => [ckv.systemId, ckv]));

    const configuredParams = summary.parameterCkvLinks.map(link => {
      const definition = definitionById.get(link.parameterSystemId);
      if (definition === undefined) {
        throw new ParameterDefinitionMissingError(link.parameterSystemId);
      }
      return {
        paramSystemId: String(link.parameterSystemId),
        paramName: definition.name,
        associatedCkvs: link.ckvSystemIds.map(ckvSystemId => {
          const ckv = ckvById.get(ckvSystemId);
          if (ckv === undefined) {
            throw new Error(`Missing CKV ${ckvSystemId} in VCPM summary`);
          }
          return {
            ckvSystemId: String(ckv.systemId),
            ckv: ckv.values,
          };
        }),
      };
    });

    return Result.ok({configuredParams});
  }
}
~~~

### 3.2 GetVcpmCalDataHandler

File:
packages/core/src/application/usecase-designer/subgraph/get-vcpm-cal-data/get-vcpm-cal-data.handler.ts

~~~typescript
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetVcpmCalDataQuery} from './get-vcpm-cal-data.query.js';
import type {CkvCalDataDto} from '../../spf-module/get-cal-data/ckv-cal-data-dto.js';
import type {ParameterDto} from '../../spf-module/dto/parameter-dto.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {ParameterDefinitionMissingError} from '../../../../shared/errors/parameter.errors.js';
import {parseParameterData} from '../../shared/parse-elements.js';
import {mapElements} from '../../spf-module/get-cal-data/ckv-cal-data-dto.js';

export class GetVcpmCalDataHandler implements QueryHandler<
  GetVcpmCalDataQuery,
  Promise<Result<CkvCalDataDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetVcpmCalDataQuery): Promise<Result<CkvCalDataDto>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );
    const subgraphResult =
      await this.queryServices.subgraphQueryService.findPropertyPayloads(
        query.subgraphSystemId,
        fileSystemId,
      );
    if (subgraphResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        'Subgraph ' + query.subgraphSystemId + ' not found',
        subgraphResult.issues,
      );
    }
    if (subgraphResult.data === null) {
      throw new ResourceNotFoundException(
        'Subgraph ' + query.subgraphSystemId + ' not found',
      );
    }

    const aggregate =
      await this.queryServices.vcpmQueryService.getVcpmCkvCalData(
      query.ckvSystemId,
      query.subgraphSystemId,
      fileSystemId,
      query.paramSystemIds.length > 0 ? query.paramSystemIds : undefined,
    );
    if (aggregate === null) {
      throw new ResourceNotFoundException(
        'CKV ' + query.ckvSystemId + ' not found',
      );
    }

    const payloads = aggregate.payloads;
    const paramSystemIds = [
      ...new Set(payloads.map(payload => payload.vcpmParameterSystemId)),
    ];
    const definitions =
      await this.queryServices.vcpmParameterDefinitionQueryService
        .getParameterDefinitionsBySystemIds(paramSystemIds, fileSystemId);
    const definitionById = new Map(
      definitions.map(definition => [definition.systemId, definition]),
    );

    const parameters = payloads.map(payload => {
      const definition = definitionById.get(payload.vcpmParameterSystemId);
      if (definition === undefined) {
        throw new ParameterDefinitionMissingError(
          payload.vcpmParameterSystemId,
        );
      }
      const elements: ParameterDto['elements'] = payload.payload
        ? (mapElements(
            parseParameterData(payload.payload, definition.elementsStructure),
          ) as ParameterDto['elements'])
        : [];
      return {
        systemId: String(payload.systemId),
        parameterId: String(definition.paramId),
        name: definition.name,
        isReadOnly: definition.isReadOnly,
        elements,
      };
    });

    return Result.ok({
      systemId: String(aggregate.ckv.systemId),
      Ckv: aggregate.ckv.values,
      parameters,
    });
  }
}
~~~

## 4. Infrastructure composition

### 4.1 Internal fetcher methods

~~~text
VcpmInstanceFetcher
  - fetchMany(subgraphSystemId, fileSystemId, sessionId: number | null)

VcpmCkvFetcher
  - fetchMany(subgraphSystemId, fileSystemId, sessionId: number | null)
  - fetchOne(ckvSystemId, subgraphSystemId, fileSystemId, sessionId: number | null)

VcpmParameterPayloadFetcher
  # Projects vcpm_parameter_payload's parameter-to-CKV foreign-key association
  # for summary composition. It does not load the binary payload blob.
  - fetchParameterCkvLinksBySubgraph(subgraphSystemId, fileSystemId, sessionId: number | null, effectiveCkvSystemIds)
  - fetchMany(ckvSystemId, subgraphSystemId, fileSystemId, sessionId: number | null, effectiveCkvSystemIds, paramSystemIds)

VcpmModuleParameterDefinitionFetcher
  - fetchMany(paramSystemIds, fileSystemId)
~~~

The instance, CKV, and payload fetchers apply session overlays.
`VcpmInstanceFetcher` is used by `VcpmCkvFetcher`. `DbVcpmQueryService`
derives effective CKV IDs from the CKV rows once and passes them to
`VcpmParameterPayloadFetcher`, avoiding a second CKV read. Every VCPM row
query is scoped through the requested file and subgraph ownership chain.
Parameter definitions are read-only reference data for this GET flow.

`fetchMany` returns raw CKV rows. `fetchParameterCkvLinksBySubgraph` returns raw
parameter-to-CKV link rows containing `parameterSystemId` and `ckvSystemId`.
`DbVcpmQueryService` combines those rows into `VcpmCkvSummaryReadModel`; it
does not resolve parameter names or other parameter metadata.

### 4.2 VCPM instance fetcher

File:
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/vcpm-instance-fetcher.ts

`VcpmInstanceFetcher` owns raw `VcpmInstance` reads and the instance-table
session overlay. `subgraphSystemId` is immutable: session CREATE rows must
carry the requested subgraph ID, and UPDATE rows cannot move an instance to a
different subgraph.

~~~typescript
import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {VcpmInstanceBase} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';

export class VcpmInstanceFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchMany(
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmInstanceBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmInstance)
      .createQueryBuilder('instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .getMany()) as unknown as VcpmInstanceBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const instanceActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmInstance,
    );
    return this.overlay
      .applyToCollection(
        baseRows,
        instanceActions,
        newValue =>
          Number(newValue.subgraphSystemId) === subgraphSystemId,
      )
      .map(row => row.effective as VcpmInstanceBase);
  }
}
~~~

### 4.3 VCPM CKV fetcher

File:
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/vcpm-ckv-fetcher.ts

`VcpmCkvFetcher` owns raw `VcpmCkv` and `VcpmCkvValues` reads and applies CKV
session overlays. Both methods join through `VcpmInstance -> Subgraph` so the requested
`subgraphSystemId` and `fileSystemId` are enforced at the database boundary.

~~~typescript
import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {VcpmCkvBase} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';
import type {VcpmInstanceFetcher} from './vcpm-instance-fetcher.js';

export class VcpmCkvFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly vcpmInstanceFetcher: VcpmInstanceFetcher,
  ) {}

  async fetchMany(
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmCkvBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'values')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .getMany()) as unknown as VcpmCkvBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const instances = await this.vcpmInstanceFetcher.fetchMany(
      subgraphSystemId,
      fileSystemId,
      sessionId,
    );
    const instanceIds = new Set(instances.map(instance => instance.systemId));
    const ckvActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmCkv,
    );
    const effectiveRows = this.overlay.applyToCollection(
      baseRows,
      ckvActions,
      newValue =>
        instanceIds.has(Number(newValue.vcpmInstanceSystemId)),
    );

    return effectiveRows
      .map(row => row.effective as VcpmCkvBase)
      .filter(row => instanceIds.has(row.vcpmInstanceSystemId));
  }

  async fetchOne(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<VcpmCkvBase | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmCkv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'values')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .getOne()) as unknown as VcpmCkvBase | null;

    if (sessionId === null) return baseRow;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const instances = await this.vcpmInstanceFetcher.fetchMany(
      subgraphSystemId,
      fileSystemId,
      sessionId,
    );
    const instanceIds = new Set(instances.map(instance => instance.systemId));
    const ckvActions = actions.filter(
      action =>
        action.targetTable === ENTITY_NAMES.VcpmCkv &&
        action.targetSystemId === ckvSystemId,
    );
    const effective = this.overlay.applyToSingle(baseRow, ckvActions);
    if (effective === null) return null;

    const row = effective.effective as VcpmCkvBase;
    return instanceIds.has(row.vcpmInstanceSystemId) ? row : null;
  }

}
~~~

### 4.4 Parameter-payload fetcher

File:
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/vcpm-parameter-payload-fetcher.ts

The link method is a persistence projection over `vcpm_parameter_payload`.
Each row in that table owns the parameter-to-CKV association through
`vcpmParameterSystemId` and `vcpmCkvSystemId`. The private query also selects
the payload row `systemId` only to apply session overlays; the public result
contains only the two foreign-key columns and never loads the binary `payload`
blob. It is not a DTO or endpoint-specific read; `DbVcpmQueryService` uses the
raw association rows to assemble its aggregate read model.

Both methods apply the payload-table session overlay. The subgraph link query
also removes links whose CKV is deleted in the active session and admits
payloads attached to session-created CKVs only when those CKVs belong to an
effective instance in the requested subgraph and file. The caller supplies
the effective CKV ID set from `VcpmCkvFetcher`; this prevents duplicate parent
table reads while retaining the payload fetcher's own row and overlay logic.

~~~typescript
import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../queries/edit-session/edit-actions-query-service.js';
import type {VcpmParameterPayloadBase} from '../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';

export interface VcpmParameterCkvLinkRow {
  parameterSystemId: number;
  ckvSystemId: number;
}

type RawParameterCkvLinkRow = Pick<
  VcpmParameterPayloadBase,
  'systemId' | 'vcpmParameterSystemId' | 'vcpmCkvSystemId'
>;

export class VcpmParameterPayloadFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns the effective parameter-to-CKV associations for one subgraph.
   *
   * The association is stored by VcpmParameterPayload's two foreign keys:
   * vcpmParameterSystemId and vcpmCkvSystemId. The private row retains its
   * systemId only for overlay merging; callers receive only the link IDs.
   * Callers that need binary calibration data use fetchMany.
   */
  async fetchParameterCkvLinksBySubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
    effectiveCkvSystemIds: ReadonlySet<number>,
  ): Promise<VcpmParameterCkvLinkRow[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('pp')
      .innerJoin('pp.vcpmCkv', 'ckv')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .select([
        'pp.systemId',
        'pp.vcpmParameterSystemId',
        'pp.vcpmCkvSystemId',
      ])
      .getMany()) as unknown as RawParameterCkvLinkRow[];

    if (sessionId === null) {
      return this.toLinks(
        baseRows.filter(row =>
          effectiveCkvSystemIds.has(row.vcpmCkvSystemId),
        ),
      );
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const payloadActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );
    if (payloadActions.length === 0) {
      return this.toLinks(
        baseRows.filter(row =>
          effectiveCkvSystemIds.has(row.vcpmCkvSystemId),
        ),
      );
    }

    const scopedBaseRows = baseRows.filter(row =>
      effectiveCkvSystemIds.has(row.vcpmCkvSystemId),
    );
    const effectiveRows = this.overlay.applyToCollection(
      scopedBaseRows,
      payloadActions,
      newValue =>
        effectiveCkvSystemIds.has(Number(newValue.vcpmCkvSystemId)),
    );

    return this.toLinks(
      effectiveRows
        .map(row => row.effective)
        .filter(row => effectiveCkvSystemIds.has(row.vcpmCkvSystemId)),
    );
  }

  async fetchMany(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
    effectiveCkvSystemIds: ReadonlySet<number>,
    paramSystemIds?: number[],
  ): Promise<VcpmParameterPayloadBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.VcpmParameterPayload)
      .createQueryBuilder('pp')
      .innerJoin('pp.vcpmCkv', 'ckv')
      .innerJoin('ckv.vcpmInstance', 'instance')
      .innerJoin(
        'instance.subgraph',
        'subgraph',
        'subgraph.systemId = :subgraphSystemId AND subgraph.fileSystemId = :fileSystemId',
        {subgraphSystemId, fileSystemId},
      )
      .where('pp.vcpmCkvSystemId = :ckvSystemId', {ckvSystemId})
      .getMany()) as unknown as VcpmParameterPayloadBase[];

    const matchesParameterFilter = (parameterSystemId: number): boolean =>
      paramSystemIds === undefined ||
      paramSystemIds.length === 0 ||
      paramSystemIds.includes(parameterSystemId);

    if (!effectiveCkvSystemIds.has(ckvSystemId)) return [];

    if (sessionId === null) {
      return baseRows.filter(row =>
        matchesParameterFilter(row.vcpmParameterSystemId),
      );
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      subgraphSystemId,
    );
    const payloadActions = actions.filter(
      action => action.targetTable === ENTITY_NAMES.VcpmParameterPayload,
    );
    const effectiveRows = this.overlay.applyToCollection(
      baseRows,
      payloadActions,
      newValue =>
        Number(newValue.vcpmCkvSystemId) === ckvSystemId &&
        effectiveCkvSystemIds.has(Number(newValue.vcpmCkvSystemId)) &&
        matchesParameterFilter(Number(newValue.vcpmParameterSystemId)),
    );

    return effectiveRows
      .map(row => row.effective as VcpmParameterPayloadBase)
      .filter(
        row =>
          row.vcpmCkvSystemId === ckvSystemId &&
          matchesParameterFilter(row.vcpmParameterSystemId),
      );
  }

  private toLinks(
    rows: Array<{
      systemId: number;
      vcpmParameterSystemId: number;
      vcpmCkvSystemId: number;
    }>,
  ): VcpmParameterCkvLinkRow[] {
    return rows.map(row => ({
      parameterSystemId: row.vcpmParameterSystemId,
      ckvSystemId: row.vcpmCkvSystemId,
    }));
  }
}
~~~

### 4.5 Parameter-definition fetcher

File:
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/fetchers/definitions/vcpm-module-definitions/vcpm-module-parameter-definition-fetcher.ts

~~~typescript
import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import type {VcpmParameterDefinitionBase} from '../../../entity-schema/usecase-data/subgraph/subgraph-vcpm-data.js';

export class VcpmModuleParameterDefinitionFetcher {
  constructor(private readonly manager: EntityManager) {}

  async fetchMany(
    paramSystemIds: number[],
    fileSystemId: number,
  ): Promise<VcpmParameterDefinitionBase[]> {
    if (paramSystemIds.length === 0) return [];
    return (await this.manager
      .getRepository(ENTITY_NAMES.VcpmModuleParameterDefinition)
      .createQueryBuilder('parameter')
      .innerJoin(
        'parameter.vcpmModuleDefinition',
        'definition',
        'definition.fileSystemId = :fileSystemId',
        {fileSystemId},
      )
      .where('parameter.systemId IN (:...paramSystemIds)', {
        paramSystemIds,
      })
      .getMany()) as unknown as VcpmParameterDefinitionBase[];
  }
}
~~~

The instance, CKV, and payload fetchers form the VCPM ownership chain and
apply their respective table overlays. Their required public fetch operations
are shown above.

## 5. Persistence query services

### 5.1 DbVcpmQueryService

File:
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/vcpm/db-vcpm-query-service.ts

~~~typescript
import {RESULT_KIND} from '@arc/core';
import type {
  ISessionRepository,
  KeyValueDefQueryService,
  VcpmCkvReadModel,
  VcpmCkvSummaryReadModel,
  VcpmCkvCalDataReadModel,
  VcpmQueryService,
} from '@arc/core';
import type {VcpmCkvFetcher} from '../../fetchers/vcpm-ckv-fetcher.js';
import type {VcpmParameterPayloadFetcher} from '../../fetchers/vcpm-parameter-payload-fetcher.js';

export class DbVcpmQueryService implements VcpmQueryService {
  constructor(
    private readonly vcpmCkvFetcher: VcpmCkvFetcher,
    private readonly parameterPayloadFetcher: VcpmParameterPayloadFetcher,
    private readonly keyValueDefQueryService: KeyValueDefQueryService,
    private readonly sessionRepository: ISessionRepository,
  ) {}

  async getVcpmCkvSummaryBySubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmCkvSummaryReadModel> {
    const sessionId = await this.resolveSessionId(fileSystemId);
    const ckvRows = await this.vcpmCkvFetcher.fetchMany(
      subgraphSystemId,
      fileSystemId,
      sessionId,
    );
    const effectiveCkvSystemIds = new Set(
      ckvRows.map(ckv => ckv.systemId),
    );
    const [ckvs, linkRows] = await Promise.all([
      this.resolveCkvValues(ckvRows, fileSystemId),
      this.parameterPayloadFetcher.fetchParameterCkvLinksBySubgraph(
        subgraphSystemId,
        fileSystemId,
        sessionId,
        effectiveCkvSystemIds,
      ),
    ]);
    const parameterCkvLinks = new Map<number, Set<number>>();
    for (const link of linkRows) {
      const ckvIds =
        parameterCkvLinks.get(link.parameterSystemId) ?? new Set<number>();
      ckvIds.add(link.ckvSystemId);
      parameterCkvLinks.set(link.parameterSystemId, ckvIds);
    }

    return {
      ckvs,
      parameterCkvLinks: [...parameterCkvLinks].map(
        ([parameterSystemId, ckvSystemIds]) => ({
          parameterSystemId,
          ckvSystemIds: [...ckvSystemIds],
        }),
      ),
    };
  }

  async getVcpmCkvCalData(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    paramSystemIds?: number[],
  ): Promise<VcpmCkvCalDataReadModel | null> {
    const sessionId = await this.resolveSessionId(fileSystemId);
    const ckvRow = await this.vcpmCkvFetcher.fetchOne(
      ckvSystemId,
      subgraphSystemId,
      fileSystemId,
      sessionId,
    );
    if (ckvRow === null) return null;

    const [ckv] = await this.resolveCkvValues([ckvRow], fileSystemId);
    const effectiveCkvSystemIds = new Set([ckvRow.systemId]);
    const payloadRows = await this.parameterPayloadFetcher.fetchMany(
      ckvSystemId,
      subgraphSystemId,
      fileSystemId,
      sessionId,
      effectiveCkvSystemIds,
      paramSystemIds,
    );

    return {
      ckv,
      payloads: payloadRows.map(row => ({
        systemId: row.systemId,
        vcpmParameterSystemId: row.vcpmParameterSystemId,
        vcpmCkvSystemId: row.vcpmCkvSystemId,
        payload: row.payload === null ? null : new Uint8Array(row.payload),
      })),
    };
  }

  private async resolveSessionId(fileSystemId: number): Promise<number | null> {
    const session =
      await this.sessionRepository.findActiveSessionByFileSystemId(
        fileSystemId,
      );
    return session?.sessionId ?? null;
  }

  private async resolveCkvValues(
    rows: Array<{
      systemId: number;
      values: Array<{valueDefSystemId: number}>;
    }>,
    fileSystemId: number,
  ): Promise<VcpmCkvReadModel[]> {
    if (rows.length === 0) return [];

    const valueDefIds = [
      ...new Set(
        rows.flatMap(row => row.values.map(value => value.valueDefSystemId)),
      ),
    ];
    const result =
      await this.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
        valueDefIds,
        fileSystemId,
      );
    if (result.kind === RESULT_KIND.Fail) {
      throw new Error('Failed to resolve CKV values for file ' + fileSystemId);
    }
    const pairs = new Map(
      result.data.map(pair => [
        pair.value.systemId,
        {
          key: {
            keyId: pair.key.keyId,
            name: pair.key.name,
            systemId: String(pair.key.systemId),
          },
          value: {
            valueId: pair.value.valueId,
            name: pair.value.name,
            systemId: String(pair.value.systemId),
          },
        },
      ]),
    );
    return rows.map(row => ({
      systemId: row.systemId,
      values: row.values.map(value => {
        const pair = pairs.get(value.valueDefSystemId);
        if (pair === undefined) {
          throw new Error(
            'Missing value definition ' + value.valueDefSystemId,
          );
        }
        return pair;
      }),
    }));
  }
}
~~~

### 5.2 DbVcpmParameterDefinitionQueryService

File:
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/vcpm/db-vcpm-parameter-definition-query-service.ts

~~~typescript
import type {
  VcpmParameterDefinitionQueryService,
  VcpmParameterDefinitionReadModel,
} from '@arc/core';
import type {VcpmModuleParameterDefinitionFetcher} from '../../fetchers/definitions/vcpm-module-definitions/vcpm-module-parameter-definition-fetcher.js';

export class DbVcpmParameterDefinitionQueryService
  implements VcpmParameterDefinitionQueryService
{
  constructor(
    private readonly parameterDefinitionFetcher:
      VcpmModuleParameterDefinitionFetcher,
  ) {}

  async getParameterDefinitionsBySystemIds(
    paramSystemIds: number[],
    fileSystemId: number,
  ): Promise<VcpmParameterDefinitionReadModel[]> {
    const rows = await this.parameterDefinitionFetcher.fetchMany(
      paramSystemIds,
      fileSystemId,
    );
    return rows.map(row => ({
      systemId: row.systemId,
      paramId: row.paramId,
      name: row.name ?? '',
      isReadOnly: row.isReadOnly,
      elementsStructure: row.elementsStructure ?? '',
    }));
  }
}
~~~

## 6. Wiring

File:
packages/infrastructure/persistence/src/persistence-typeorm-sqllite/queries/typeorm-query-services.ts

~~~typescript
import type {
  QueryServices,
  VcpmParameterDefinitionQueryService,
  VcpmQueryService,
} from '@arc/core';
import {VcpmInstanceFetcher} from '../fetchers/vcpm-instance-fetcher.js';
import {VcpmCkvFetcher} from '../fetchers/vcpm-ckv-fetcher.js';
import {VcpmParameterPayloadFetcher} from '../fetchers/vcpm-parameter-payload-fetcher.js';
import {VcpmModuleParameterDefinitionFetcher} from '../fetchers/definitions/vcpm-module-definitions/vcpm-module-parameter-definition-fetcher.js';
import {DbVcpmQueryService} from './vcpm/db-vcpm-query-service.js';
import {DbVcpmParameterDefinitionQueryService} from './vcpm/db-vcpm-parameter-definition-query-service.js';

const vcpmInstanceFetcher = new VcpmInstanceFetcher(
  dataSource.manager,
  editActionsQueryService,
);
const vcpmCkvFetcher = new VcpmCkvFetcher(
  dataSource.manager,
  editActionsQueryService,
  vcpmInstanceFetcher,
);
const parameterPayloadFetcher = new VcpmParameterPayloadFetcher(
  dataSource.manager,
  editActionsQueryService,
);
const parameterDefinitionFetcher = new VcpmModuleParameterDefinitionFetcher(
  dataSource.manager,
);

this.vcpmQueryService = new DbVcpmQueryService(
  vcpmCkvFetcher,
  parameterPayloadFetcher,
  this.keyValueDefQueryService,
  sessionRepository,
);
this.vcpmParameterDefinitionQueryService =
  new DbVcpmParameterDefinitionQueryService(
    parameterDefinitionFetcher,
  );
~~~

`DbQueryServices` declares both properties and implements both core ports:

~~~typescript
export class DbQueryServices implements QueryServices {
  readonly vcpmQueryService: VcpmQueryService;
  readonly vcpmParameterDefinitionQueryService:
    VcpmParameterDefinitionQueryService;
}
~~~

## 7. Controller boundary

The existing SubgraphController remains unchanged. It creates
GetVcpmCkvQuery or GetVcpmCalDataQuery and dispatches the query through
QueryBus. It does not know about persistence fetchers.

## 8. Required changes

1. Move `KeyInfoDtoSchema`, `ValueInfoDtoSchema`, and
   `KeyValueInfoDtoSchema` (and their inferred types) from the SPF DTO file to
   `shared/dto/key-value-info-dto.ts`; update SPF and subgraph imports, and
   retain their public core exports.
2. Add `vcpm-read-model.ts` with all VCPM read models and public core exports.
3. Add VcpmParameterDefinitionQueryService to the core ports and public core
   exports.
4. Add vcpmParameterDefinitionQueryService to QueryServices and
   DbQueryServices.
5. Expose only getVcpmCkvSummaryBySubgraph and getVcpmCkvCalData from
   VcpmQueryService.
6. Keep parameter-definition lookup in the handlers through
   VcpmParameterDefinitionQueryService.
7. Add DbVcpmParameterDefinitionQueryService.
8. Add VcpmInstanceFetcher for overlaid VcpmInstance reads; inject it into
   VcpmCkvFetcher.
9. Use VcpmCkvFetcher for VcpmCkv and VcpmCkvValues reads. DbVcpmQueryService
   passes the effective CKV ID set to VcpmParameterPayloadFetcher, avoiding a
   duplicate CKV read.
10. Update both handlers to call the new definition query service.
11. Scope all persistence reads by fileSystemId and ownership relationship.
12. Keep existing query-handler registry registrations.
13. Keep packages/core free from TypeORM, NestJS, and Node.js imports.

## 9. Tests

### Handler tests

- summary handler calls the definition service with unique parameter IDs;
- cal-data handler calls it with IDs from selected payloads;
- missing definitions raise ParameterDefinitionMissingError;
- missing subgraph and CKV return 404;
- payloads are parsed with elementsStructure;
- null payloads produce empty elements.

### Query-service tests

- DbVcpmQueryService resolves active sessions;
- CKV values are resolved through KeyValueDefQueryService;
- CKV summary fetches effective CKV rows once and passes their ID set to the
  payload fetcher;
- payloads are mapped to Uint8Array;
- DbVcpmParameterDefinitionQueryService delegates to its fetcher;
- definition reads are scoped by fileSystemId.

### Overlay-fetcher tests

- VCPM instance create and delete overlays;
- CKV create and delete overlays;
- payload create and delete overlays;
- parameter-to-CKV link overlay;
- a payload link moved by an edit action outside the effective CKV ID set is
  excluded from the link projection;
- the public parameter-to-CKV link projection contains only parameter and CKV
  IDs, never the payload row systemId or binary payload;
- CKV and payload ownership scoped by subgraph and file.

## 10. Design decision

The selected design combines two endpoint-oriented aggregate methods on
`VcpmQueryService` with direct parameter-definition lookups from both
handlers. The aggregate methods return CKV/payload/link data; the dedicated
`VcpmParameterDefinitionQueryService` returns parameter metadata. The handlers
combine those read models into the final DTOs.
