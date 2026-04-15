/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {KeyDefinition} from '../../../../domain/entities/definitions/key-value/key-definition.js';
import {ForeignKeyMapper} from './foreign-key-mapper.js';

/**
 * Service responsible for managing system ID assignment to domain entities.
 * Handles:
 * - System ID generation for entities and their children
 * - File system ID assignment
 * - Foreign key mapping storage during ID assignment
 * - Encapsulates ForeignKeyMapper for internal FK management
 */
export class EntitySystemIdService {
  private foreignKeyMapper: ForeignKeyMapper;

  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly logger?: Logger,
  ) {
    this.foreignKeyMapper = new ForeignKeyMapper(logger);
  }

  /**
   * Assign system IDs and file system ID to key definitions and their value definitions.
   * Also stores foreign key mappings immediately after ID generation.
   * Mutates the input objects directly.
   *
   * @param keyDefinitions - Key definitions with systemId = 0 and fileSystemId = 0 (from builder)
   * @param fileSystemId - File system ID to assign
   * @returns Same key definitions with IDs assigned and mappings stored
   */
  async assignSystemIdsToKeyDefinitions(
    keyDefinitions: KeyDefinition[],
    fileSystemId: number,
  ): Promise<KeyDefinition[]> {
    if (!keyDefinitions || keyDefinitions.length === 0) {
      return [];
    }

    this.logger?.logInfo({
      msg: `Assigning system IDs to ${keyDefinitions.length} key definitions`,
      action: 'system_id_assignment_start',
      component: 'EntitySystemIdService',
      tag: 'id-assignment',
      timestamp: new Date(),
    });

    for (const keyDef of keyDefinitions) {
      // Assign file system ID
      keyDef.fileSystemId = fileSystemId;

      // Assign system ID to key definition
      keyDef.systemId = await this.idGenerator.getNextId(fileSystemId);

      // Store key definition mapping immediately
      this.foreignKeyMapper.addKeyDefinitionMapping(
        keyDef.keyId,
        keyDef.systemId,
      );

      // Assign system IDs to value definitions and store mappings
      for (const valueDef of keyDef.values) {
        valueDef.systemId = await this.idGenerator.getNextId(fileSystemId);

        // Store value definition mapping immediately
        this.foreignKeyMapper.addValueDefinitionMapping(
          keyDef.keyId,
          valueDef.valueId,
          valueDef.systemId,
        );
      }
    }

    this.logger?.logInfo({
      msg: `Assigned system IDs to ${keyDefinitions.length} key definitions and stored FK mappings`,
      action: 'system_id_assignment_complete',
      component: 'EntitySystemIdService',
      tag: 'id-assignment',
      timestamp: new Date(),
    });

    return keyDefinitions;
  }
}
