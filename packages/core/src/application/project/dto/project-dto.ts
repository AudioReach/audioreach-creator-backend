/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {z} from 'zod';
import {PROJECT_TYPE} from '../../../domain/entities/usecase-data/project/project.js';
import {SESSION_MODE} from '../../shared/change-vocabulary.js';
import type {ProjectReadModel} from '../../ports/persistence/query-services/project/project-query-service.js';

export const ProjectDtoSchema = z
  .object({
    projectId: z.number().int().describe('Unique identifier of the project'),
    name: z.string().describe('Human-readable name of the project'),
    description: z.string().describe('Detailed description of the project'),
    type: z
      .enum([PROJECT_TYPE.OFFLINE, PROJECT_TYPE.DEVICE])
      .describe('Type of the project'),
    sessionMode: z
      .enum(Object.values(SESSION_MODE) as [string, ...string[]])
      .describe('Current session mode for the project'),
  })
  .meta({id: 'ProjectDto'});

export type ProjectDto = z.infer<typeof ProjectDtoSchema>;

export function mapProject(m: ProjectReadModel): ProjectDto {
  return {
    projectId: m.systemId,
    name: m.name,
    description: m.description,
    type: m.type,
    sessionMode: m.sessionMode,
  };
}
