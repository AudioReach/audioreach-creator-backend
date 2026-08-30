/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {InvalidOperationException} from '../../../../shared/exceptions/invalid-operation.exception.js';
import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import type {ElementData as ElementCalData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {BinaryDataReader} from '../../shared/utils/binary-data-reader.js';
import {BinaryDataWriter} from '../../shared/utils/binary-data-writer.js';
import {convertParamDefinition} from '../../shared/parse-elements.js';
import {
  SUB_GRAPH_PROP_ID_SCENARIO_ID,
  SUB_GRAPH_PROP_ID_VSID,
  SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR,
  SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL,
} from '../../../file-operations/shared/constants/spf-ids.js';
import {PARAMETER_ELEMENT_TYPE} from '../../shared/element-definition.js';
import type {ConfigElement} from '../../shared/element-definition.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {UpdateSubgraphScenarioCommand} from './update-subgraph-scenario.command.js';
import type {ScenarioChangeDto} from '../dto/subgraph-write-result-types.js';
import type {SubgraphPropertyDefinitionWithElementsReadModel} from '../../../ports/persistence/query-services/subgraph-property-definition/subgraph-property-definition-with-elements-read-model.js';
import type {SubgraphWithProperties} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {SpfModuleBase} from '../../../ports/persistence/repositories/module/module.repository.js';

type MutationLog = Pick<
  ScenarioChangeDto,
  | 'propertiesAdded'
  | 'propertiesRemoved'
  | 'moduleCkvsAdded'
  | 'moduleCkvsDeleted'
>;

export class UpdateSubgraphScenarioHandler implements CommandHandler<
  UpdateSubgraphScenarioCommand,
  ScenarioChangeDto
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(
    command: UpdateSubgraphScenarioCommand,
  ): Promise<ScenarioChangeDto> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;

    const subgraph = await this.uow
      .getSubgraphRepository()
      .getSubgraphWithProperties(command.subgraphSystemId, fileSystemId);
    if (!subgraph) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    const {
      scenarioDef,
      currentScenario,
      requestedScenario,
      serializedScenario,
    } = await this.resolveScenarioContext(command, fileSystemId, subgraph);

    if (currentScenario === requestedScenario) {
      return {
        groupId,
        propertiesAdded: [],
        propertiesRemoved: [],
        moduleCkvsAdded: [],
        moduleCkvsDeleted: [],
      };
    }

    const isAudioToVoice =
      currentScenario !== SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL &&
      requestedScenario === SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL;
    const isVoiceToAudio =
      currentScenario === SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL &&
      requestedScenario !== SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL;

    const allDefsResult =
      await this.queryServices.subgraphPropertyDefQueryService.getAllDetailedSubgraphPropertyDefinitionsWithElements(
        fileSystemId,
      );
    if (allDefsResult.kind === RESULT_KIND.Fail) {
      throw new Error('Failed to load subgraph property definitions');
    }
    const allDefs = allDefsResult.data;

    let optimalVsid: number | undefined;
    if (isAudioToVoice) {
      optimalVsid = await this.getOptimalVsid(
        command.subgraphSystemId,
        fileSystemId,
        allDefs,
      );
    }

    // Pre-fetch modules before transaction — reads must not be inside the write transaction
    const modules =
      isAudioToVoice || isVoiceToAudio
        ? await this.uow
            .getModuleRepository()
            .getModulesBySubgraphId(command.subgraphSystemId, fileSystemId)
        : [];

    const log: MutationLog = {
      propertiesAdded: [],
      propertiesRemoved: [],
      moduleCkvsAdded: [],
      moduleCkvsDeleted: [],
    };

    await this.uow.startTransaction();
    try {
      if (isAudioToVoice) {
        await this.audioToVoiceCascade(
          command.subgraphSystemId,
          fileSystemId,
          subgraph,
          allDefs,
          optimalVsid,
          modules,
          log,
        );
      } else if (isVoiceToAudio) {
        await this.voiceToAudioCascade(
          command.subgraphSystemId,
          fileSystemId,
          subgraph,
          allDefs,
          modules,
          log,
        );
      }

      await this.uow
        .getSubgraphRepository()
        .setPropertyData(
          command.subgraphSystemId,
          scenarioDef.systemId,
          serializedScenario,
        );

      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }

    return {groupId, ...log};
  }

  private async resolveScenarioContext(
    command: UpdateSubgraphScenarioCommand,
    fileSystemId: number,
    subgraph: SubgraphWithProperties,
  ) {
    const scenarioDefsResult =
      await this.queryServices.subgraphPropertyDefQueryService.getAllSubgraphPropertyDefinitionsSummary(
        fileSystemId,
        SUB_GRAPH_PROP_ID_SCENARIO_ID,
      );
    if (
      scenarioDefsResult.kind === RESULT_KIND.Fail ||
      scenarioDefsResult.data.length === 0
    ) {
      throw new ResourceNotFoundException(
        'Scenario property definition not found',
      );
    }
    const scenarioDef = scenarioDefsResult.data[0];

    const scenarioProp = subgraph.properties.find(
      p => p.propertySystemId === scenarioDef.systemId,
    );
    const currentScenario = scenarioProp?.payload
      ? new BinaryDataReader(scenarioProp.payload).readUInt32()
      : undefined;

    const requestedScenario = Number(command.elements[0]?.value);

    const scenarioDefWithElements =
      await this.queryServices.subgraphPropertyDefQueryService.getSubgraphPropertyDefinitionWithElements(
        scenarioDef.systemId,
        fileSystemId,
      );
    if (scenarioDefWithElements.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        'Scenario property definition (with elements) not found',
      );
    }
    const serialized = serializeParameterData(
      {
        systemId: scenarioDefWithElements.data.systemId,
        isReadOnly: false,
        elementsStructure: scenarioDefWithElements.data.elementsStructure,
      },
      command.elements as unknown as ElementCalData[],
    );
    if (!serialized.ok) {
      throw new InvalidOperationException(serialized.error);
    }
    return {
      scenarioDef,
      currentScenario,
      requestedScenario,
      serializedScenario: serialized.value,
    };
  }

  private async audioToVoiceCascade(
    subgraphSystemId: number,
    fileSystemId: number,
    subgraph: SubgraphWithProperties,
    allDefs: SubgraphPropertyDefinitionWithElementsReadModel[],
    optimalVsid: number | undefined,
    modules: SpfModuleBase[],
    log: MutationLog,
  ): Promise<void> {
    const voiceDefs = allDefs.filter(d => d.isVoice);
    const clockScaleDef = allDefs.find(
      d => d.propertyId === SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR,
    );
    const existingPropIds = new Set(
      subgraph.properties.map(p => p.propertySystemId),
    );

    for (const def of voiceDefs) {
      if (existingPropIds.has(def.systemId)) continue;
      const newId = await this.uow
        .getSubgraphRepository()
        .addProperty(subgraphSystemId, def.systemId, def);
      log.propertiesAdded.push({
        systemId: String(newId),
        propertyId: def.propertyId,
        propertyName: def.name,
      });
    }

    if (clockScaleDef) {
      const clockProp = subgraph.properties.find(
        p => p.propertySystemId === clockScaleDef.systemId,
      );
      if (clockProp) {
        await this.uow
          .getSubgraphRepository()
          .removeProperty(subgraphSystemId, clockProp.systemId);
        log.propertiesRemoved.push({
          systemId: String(clockProp.systemId),
          propertyId: clockScaleDef.propertyId,
          propertyName: clockScaleDef.name,
        });
      }
    }

    if (optimalVsid !== undefined) {
      const vsidDefsResult =
        await this.queryServices.subgraphPropertyDefQueryService.getAllSubgraphPropertyDefinitionsSummary(
          fileSystemId,
          SUB_GRAPH_PROP_ID_VSID,
        );
      const vsidDef =
        vsidDefsResult.kind !== RESULT_KIND.Fail
          ? vsidDefsResult.data[0]
          : undefined;
      if (vsidDef) {
        const writer = new BinaryDataWriter();
        writer.writeUInt32(optimalVsid);
        writer.align(8);
        await this.uow
          .getSubgraphRepository()
          .setPropertyData(
            subgraphSystemId,
            vsidDef.systemId,
            writer.toUint8Array(),
          );
      }
    }

    await this.wipeModuleCalData(modules, fileSystemId, log);

    const vcpmDefs =
      await this.queryServices.vcpmDefinitionQueryService.getVcpmModuleDefinitionsWithParams(
        fileSystemId,
      );
    await this.uow
      .getSubgraphRepository()
      .addVcpmCfgDefaultData(subgraphSystemId, vcpmDefs);
  }

  private async voiceToAudioCascade(
    subgraphSystemId: number,
    fileSystemId: number,
    subgraph: SubgraphWithProperties,
    allDefs: SubgraphPropertyDefinitionWithElementsReadModel[],
    modules: SpfModuleBase[],
    log: MutationLog,
  ): Promise<void> {
    await this.wipeModuleCalData(modules, fileSystemId, log);

    const voiceDefs = allDefs.filter(d => d.isVoice);
    for (const def of voiceDefs) {
      const voiceProp = subgraph.properties.find(
        p => p.propertySystemId === def.systemId,
      );
      if (!voiceProp) continue;
      await this.uow
        .getSubgraphRepository()
        .removeProperty(subgraphSystemId, voiceProp.systemId);
      log.propertiesRemoved.push({
        systemId: String(voiceProp.systemId),
        propertyId: def.propertyId,
        propertyName: def.name,
      });
    }

    const clockScaleDef = allDefs.find(
      d => d.propertyId === SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR,
    );
    if (clockScaleDef) {
      const newId = await this.uow
        .getSubgraphRepository()
        .addProperty(subgraphSystemId, clockScaleDef.systemId, clockScaleDef);
      log.propertiesAdded.push({
        systemId: String(newId),
        propertyId: clockScaleDef.propertyId,
        propertyName: clockScaleDef.name,
      });
    }

    await this.uow
      .getSubgraphRepository()
      .removeAllVcpmCfgData(subgraphSystemId);
  }

  private async wipeModuleCalData(
    modules: SpfModuleBase[],
    fileSystemId: number,
    log: MutationLog,
  ): Promise<void> {
    const results = await Promise.all(
      modules.map(mod =>
        this.uow
          .getModuleRepository()
          .wipeCalData(mod.systemId, fileSystemId)
          .then(wiped => ({mod, wiped})),
      ),
    );
    for (const {mod, wiped} of results) {
      log.moduleCkvsDeleted.push(
        ...wiped.ckvsDeleted.map(c => ({
          moduleSystemId: String(mod.systemId),
          ckvSystemId: String(c),
        })),
      );
      log.moduleCkvsAdded.push(
        ...wiped.zeroCkvsAdded.map(c => ({
          moduleSystemId: String(mod.systemId),
          ckvSystemId: String(c),
        })),
      );
    }
  }

  private async getOptimalVsid(
    subgraphSystemId: number,
    fileSystemId: number,
    allDefs: SubgraphPropertyDefinitionWithElementsReadModel[],
  ): Promise<number> {
    const vsidDef = allDefs.find(d => d.propertyId === SUB_GRAPH_PROP_ID_VSID);
    if (!vsidDef)
      throw new ResourceNotFoundException('VSID property definition not found');

    const scenarioDefSystemId = allDefs.find(
      d => d.propertyId === SUB_GRAPH_PROP_ID_SCENARIO_ID,
    )?.systemId;
    const foundVsids = await this.bfsCollectVoiceVsids(
      subgraphSystemId,
      fileSystemId,
      vsidDef.systemId,
      scenarioDefSystemId,
    );

    if (foundVsids.size === 0) {
      const schema = convertParamDefinition(vsidDef.elementsStructure);
      const firstConfig = schema.find(
        (e): e is ConfigElement =>
          e.elementType === PARAMETER_ELEMENT_TYPE.ConfigElement,
      );
      return Number(firstConfig?.defaultValue ?? '0');
    }
    if (foundVsids.size === 1) {
      return [...foundVsids][0];
    }
    throw new DomainRuleViolationException([
      {
        code: 'VSID_CONFLICT',
        message: `Conflicting VSIDs found across linked usecases: ${[...foundVsids].join(', ')}`,
        severity: IssueSeverity.Error,
      },
    ]);
  }

  private async bfsCollectVoiceVsids(
    startId: number,
    fileSystemId: number,
    vsidDefSystemId: number,
    scenarioDefSystemId: number | undefined,
  ): Promise<Set<number>> {
    // Pass 1: BFS using only getSubgraphIdsInSameUsecases
    const reachableIds = await this.bfsReachableIds(startId, fileSystemId);
    reachableIds.delete(startId); // exclude self — we only want linked Voice subgraphs

    if (reachableIds.size === 0) return new Set();

    // Pass 2: batch-fetch properties in 2 queries
    const subgraphMap = await this.uow
      .getSubgraphRepository()
      .getSubgraphsWithProperties([...reachableIds], fileSystemId);

    // Pass 3: collect VSIDs from Voice subgraphs only
    const foundVsids = new Set<number>();
    for (const [, sg] of subgraphMap) {
      if (scenarioDefSystemId !== undefined) {
        const scenarioProp = sg.properties.find(
          p => p.propertySystemId === scenarioDefSystemId,
        );
        const scenarioVal = scenarioProp?.payload
          ? new BinaryDataReader(scenarioProp.payload).readUInt32()
          : undefined;
        if (scenarioVal !== SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL)
          continue;
      }
      const vsidProp = sg.properties.find(
        p => p.propertySystemId === vsidDefSystemId,
      );
      if (vsidProp?.payload) {
        foundVsids.add(new BinaryDataReader(vsidProp.payload).readUInt32());
      }
    }
    return foundVsids;
  }

  private async bfsReachableIds(
    startId: number,
    fileSystemId: number,
  ): Promise<Set<number>> {
    const visited = new Set<number>([startId]);
    let frontier = [startId];

    while (frontier.length > 0) {
      const linked = await this.uow
        .getSubgraphRepository()
        .getSubgraphIdsInSameUsecasesForMany(frontier, fileSystemId);
      frontier = linked.filter(id => !visited.has(id));
      for (const id of frontier) visited.add(id);
    }
    return visited;
  }
}
