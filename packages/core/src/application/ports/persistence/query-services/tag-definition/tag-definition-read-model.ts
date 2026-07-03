/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinitionReadModel} from '../key-value/key-value-definition-read-model.js';

/**
 * Tag → key link, resolved from tag_key_def_links.
 * Embeds the full KeyDefinitionReadModel1 (key fields + its values).
 */
export interface TagKeyDefinitionReadModel {
  readonly cHeaderTagEnumMemberName?: string;
  readonly keyDefinition: KeyDefinitionReadModel;
}

/**
 * Full projection of the TagDefinition domain entity (tag_definitions table).
 */
export interface TagDefinitionReadModel {
  readonly systemId: number;
  readonly tagId: number;
  readonly name: string;
  readonly description?: string;
  readonly isVoice: boolean;
  readonly cHeaderEnumName?: string;
  readonly cHeaderEnumMember?: string;
  readonly keys: TagKeyDefinitionReadModel[];
}
