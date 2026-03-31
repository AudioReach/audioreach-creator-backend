/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsArray} from 'class-validator';
import {BaseComponentDto} from '../../../common/dto/base-component.dto.js';
import {BaseDto} from '../../../common/dto/base.dto.js';
import {
  KeyValuePairsInfo,
  KeyValueInfo,
  SubsystemFilteredKeyValuePairsInfo,
} from '../../../common/dto/kv.dto.js';
import {EndPointLink, ModificationAction} from '../../../common/utils/index.js';
import {ComponentCollectionDto} from '../../../common/dto/component-collection.dto.js';

/**
 * TypeScript interface for equality comparison
 */
export interface IEquatable<T> {
  equals(other: T): boolean;
}

export enum UsecaseType {
  Ec = 'Ec',
  Regular = 'Regular',
  Manual = 'Manual',
}

export class UsecaseIdentifierDto extends BaseDto {
  @ApiProperty({
    description: 'System identifier of the usecase',
    type: String,
  })
  systemId!: string;

  @ApiProperty({
    description: 'Collection of key-value pairs',
    type: [KeyValueInfo],
  })
  readonly keyValueCollection: ReadonlyArray<KeyValueInfo>;

  @ApiProperty({
    description: 'Optional alias identifier for the usecase',
    type: Number,
    required: false,
  })
  usecaseAliasId?: number;

  @ApiProperty({
    description: 'Alias name for the usecase',
    type: String,
    required: false,
  })
  usecaseAliasName?: string;

  @ApiProperty({
    description: 'Category of the usecase',
    type: String,
    required: false,
  })
  usecaseCategory?: string;

  @ApiProperty({
    description: 'Type of the usecase',
    enum: UsecaseType,
  })
  usecaseType!: UsecaseType;

  @ApiProperty({
    description: 'Related endpoint links for the usecase',
    type: [EndPointLink],
    required: false,
  })
  relatedEndPointLinks?: EndPointLink[];

  constructor(
    systemId: string,
    useCaseType: UsecaseType,
    kvInfo: KeyValuePairsInfo,
    aliasId?: number,
    aliasName?: string,
    category?: string,
  ) {
    super();
    this.systemId = systemId;
    this.keyValueCollection = kvInfo.keyValueCollection;
    this.usecaseType = useCaseType;
    this.usecaseAliasId = aliasId;
    this.usecaseAliasName = aliasName;
    this.usecaseCategory = category;

    const link = new EndPointLink();
    link.hypertextRef = `/usecases/components/get`;
    link.method = 'POST';
    link.description = 'Get all components of usecase.';
    this.relatedEndPointLinks = [link];
  }
}

/**
 * Simple DTO for usecase response.
 * Extends UsecaseIdentifierDto to provide a DTO wrapper for the /usecases endpoint.
 */
export class UsecaseDto extends UsecaseIdentifierDto {
  // Inherits all properties from UsecaseIdentifierDto
  // Additional response-specific fields can be added here if needed in the future
}

/**
 * DTO for subsystem-filtered usecases.
 * Used by the /usecases/filtered-by-subsystem endpoint.
 * Contains subsystem-filtered key-value information and an array of usecase identifiers that match the filter.
 */
export class SubsystemFilteredUsecasesDto {
  @ApiProperty({
    description: 'Subsystem-filtered key-value information',
    type: SubsystemFilteredKeyValuePairsInfo,
  })
  readonly filteredKv: SubsystemFilteredKeyValuePairsInfo;

  @ApiProperty({
    description: 'Array of usecase identifiers that match the subsystem filter',
    type: [UsecaseIdentifierDto],
  })
  @IsArray()
  readonly usecases: UsecaseIdentifierDto[];

  /**
   * Constructor for subsystem-filtered usecases
   * @param filteredKv Subsystem filtered key-value information
   * @param usecases List of raw GKVs under the filtered GKV
   */
  constructor(
    filteredKv: SubsystemFilteredKeyValuePairsInfo,
    usecases: UsecaseIdentifierDto[],
  ) {
    this.filteredKv = filteredKv;
    this.usecases = usecases;
  }

  /**
   * Validates the data integrity of the DTO
   * Ensures that filteredKv is not null and usecases has at least one item
   */
  validate(): {isValid: boolean; errors: string[]} {
    const errors: string[] = [];

    if (!this.filteredKv) {
      errors.push('filteredKv is required');
    }

    if (!this.usecases || this.usecases.length === 0) {
      errors.push('usecases array must contain at least one item');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Throws an error if the DTO is in an invalid state
   */
  assertValid(): void {
    const validation = this.validate();
    if (!validation.isValid) {
      throw new Error(
        `SubsystemFilteredUsecasesDto validation failed: ${validation.errors.join(', ')}`,
      );
    }
  }
}

/**
 * Full usecases information including usecase identifier and all its
 * components (module-instances, data links, control links, dangling links).
 */
export class UsecaseWithComponents {
  @ApiProperty({
    description: 'Usecase identifier information',
    type: UsecaseIdentifierDto,
  })
  readonly usecaseIdentifier: UsecaseIdentifierDto;

  @ApiProperty({
    description: 'Array of components in the usecase',
    type: [BaseComponentDto],
  })
  components: BaseComponentDto<number>[] = [];

  constructor(usecaseId: UsecaseIdentifierDto) {
    this.usecaseIdentifier = usecaseId;
  }
}

export class UsecaseWithModificationSummary {
  @ApiProperty({
    description: 'Usecase with components information',
    type: UsecaseWithComponents,
  })
  readonly usecase: UsecaseWithComponents;

  @ApiProperty({
    description: 'Type of modification action performed on the usecase',
    enum: ModificationAction,
  })
  readonly usecaseModification: ModificationAction;

  @ApiProperty({
    description: 'Summary of the modifications made to the usecase',
    type: String,
  })
  readonly modificationSummary: string;

  constructor(
    usecaseWithComponents: UsecaseWithComponents,
    usecaseModificaiton: ModificationAction,
    summary: string,
  ) {
    this.usecase = usecaseWithComponents;
    this.usecaseModification = usecaseModificaiton;
    this.modificationSummary = summary;
  }
}

/**
 * DTO for usecase components API response.
 * Contains usecase identifiers and their associated component collection.
 */
export class UsecaseComponentsDto {
  @ApiProperty({
    description: 'Array of usecase identifiers that these components belong to',
    type: [UsecaseIdentifierDto],
  })
  usecaseIdentifiers: UsecaseIdentifierDto[];

  @ApiProperty({
    description: 'Collection of all components for the specified usecases',
    type: ComponentCollectionDto,
  })
  components: ComponentCollectionDto;

  constructor(
    usecaseIdentifiers: UsecaseIdentifierDto[],
    components: ComponentCollectionDto,
  ) {
    this.usecaseIdentifiers = usecaseIdentifiers;
    this.components = components;
  }
}
