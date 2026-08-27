/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {
  ModuleDefinitionRepository,
  ModuleParameterDefinition,
} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import type {PayloadEntry} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import {ModuleParameterData} from '../../../../domain/entities/common/value-objects/module-parameter-data.js';
import {TOOL_POLICY} from '../../../../domain/entities/definitions/common/types/tool-policy-type.js';
import {asSystemId} from '../../../../shared/types/branded-ids.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';

/**
 * Determines which parameter definitions a new CKV/TKV should be seeded
 * with: all Calibration-policy definitions when no key-value entity exists
 * yet, otherwise the exact parameter set inherited from one existing entity
 * (so every CKV/TKV of the same module/tag stays payload-aligned).
 */
export async function resolveParametersToSeed(
  definitionSystemId: number,
  inheritFromSystemId: number | undefined,
  defRepo: ModuleDefinitionRepository,
  getPayloads: (systemId: number) => Promise<PayloadEntry[]>,
  entityLabel: string,
): Promise<ModuleParameterDefinition[]> {
  if (inheritFromSystemId === undefined) {
    const allDefs = await defRepo.getParameterDefinitions(definitionSystemId);
    return allDefs.filter(def => def.toolPolicy === TOOL_POLICY.Calibration);
  }

  const payloads = await getPayloads(inheritFromSystemId);
  const parameterSystemIds = payloads.map(payload => payload.parameterSystemId);
  if (parameterSystemIds.length === 0) return [];

  const definitions = await defRepo.getParameterDefinitions(
    definitionSystemId,
    parameterSystemIds,
  );
  const foundIds = new Set(definitions.map(definition => definition.systemId));
  const missingIds = [...new Set(parameterSystemIds)].filter(
    systemId => !foundIds.has(systemId),
  );
  if (missingIds.length > 0) {
    throw new Error(
      `Parameter definitions missing for inherited ${entityLabel} payloads: ${missingIds.join(', ')}`,
    );
  }
  return definitions;
}

/**
 * Serializes default parameter data for each definition and attaches it to
 * the given CKV/TKV aggregate as a parameter payload.
 */
export async function seedKvParameterPayloads(
  kvData: KvData,
  paramDefs: readonly ModuleParameterDefinition[],
  fileSystemId: number,
  idGeneration: IdGenerationPort,
): Promise<void> {
  for (const def of paramDefs) {
    const serialized = serializeDefaultParameterData(def);
    if (!serialized.ok) {
      throw new Error(
        `Failed to serialize default data for parameter ${def.systemId}: ${serialized.error}`,
      );
    }
    const payloadSystemId = await idGeneration.getNextId(fileSystemId);
    const paramData = new ModuleParameterData(
      asSystemId(def.systemId),
      serialized.value,
    );
    paramData.payloadSystemId = payloadSystemId;
    kvData.addParameterPayload(paramData);
  }
}
