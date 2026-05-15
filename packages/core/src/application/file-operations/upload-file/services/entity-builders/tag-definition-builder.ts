/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import {TagDefinition} from '../../../../../domain/entities/definitions/tag-key-value/tag-definition.js';
import {TagDefKeyDefLink} from '../../../../../domain/entities/definitions/tag-key-value/value-objects/tag-key.js';
import type {AwspTagDefinition} from '../../../shared/awsp-serializers/v1/definitions/index.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../shared/types/branded-ids.js';
import type {BuildResult} from '../../types/issue-collection.js';

/**
 * Builder for creating TagDefinition domain entities from AWSP tag definitions.
 * Follows the same pattern as KeyDefinitionBuilder.
 */
export class TagDefinitionBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build TagDefinition entities from AWSP tag definitions with system IDs assigned
   */
  async buildTagDefinitions(
    awspTagDefinitions: AwspTagDefinition[],
    fileSystemId: number,
  ): Promise<BuildResult<TagDefinition>> {
    const entities: TagDefinition[] = [];

    for (const awspTagDef of awspTagDefinitions) {
      // Generate system ID
      const systemId = await this.idGenerator.getNextId(fileSystemId);

      // Map supportedKeys to keysAllowed (TagDefKeyDefLink[])
      const keysAllowed: TagDefKeyDefLink[] = [];
      if (awspTagDef.supportedKeys) {
        for (const supportedKey of awspTagDef.supportedKeys) {
          // Resolve key definition system ID from natural ID
          const keySystemId = this.foreignKeyMapper.getKeySystemId(
            asNaturalId(supportedKey.id),
          );

          if (keySystemId === undefined) {
            this.logger?.logWarn({
              msg: `Key definition system ID not found for key ${supportedKey.id} in tag ${awspTagDef.id}`,
              action: 'key_definition_resolution_failed',
              component: 'TagDefinitionBuilder',
              tag: 'tag-definition-building',
              timestamp: new Date(),
            });
            continue;
          }

          keysAllowed.push(
            new TagDefKeyDefLink({
              keyReferenceSystemId: keySystemId,
              tagEnumValue: supportedKey.enumValue,
            }),
          );
        }
      }

      // Create TagDefinition entity
      const tagDefinition = new TagDefinition({
        systemId,
        tagId: awspTagDef.id,
        name: awspTagDef.name,
        description: awspTagDef.description,
        keysAllowed,
        isVoice: awspTagDef.isVoice ?? false,
        cHeaderEnumName: awspTagDef.enumName,
        cHeaderEnumValue: awspTagDef.enumValue,
        fileSystemId,
      });

      entities.push(tagDefinition);

      // Store mapping for foreign key resolution
      this.foreignKeyMapper.addTagDefinitionMapping(
        asNaturalId(awspTagDef.id),
        asSystemId(systemId),
      );
    }

    this.logger?.logInfo({
      msg: `Built ${entities.length} tag definitions with system IDs assigned`,
      action: 'tag_definitions_built',
      component: 'TagDefinitionBuilder',
      tag: 'tag-definition-building',
      timestamp: new Date(),
    });

    return {
      entities,
      issues: [],
      successCount: entities.length,
      errorCount: 0,
      warningCount: 0,
    };
  }
}
