import {ApiProperty} from '@nestjs/swagger';
import {IsArray, ArrayMaxSize} from 'class-validator';
import {BaseComponentDto} from '../../../common/dto/base-component.dto.js';
import {KVInfo, KeyValueInfo} from '../../../common/dto/kv.dto.js';
import {EndPointLink, ModificationAction} from '../../../common/utils/index.js';
import {SubsystemDto} from '../../subsystem/dto/subsystem.dto.js';
import {ModuleInstanceDto} from '../../module-instance/dto/module-instance.dto.js';
import {DataLinkDto} from '../../data-link/dto/data-link.dto.js';
import {ControlLinkDto} from '../../control-link/dto/control-link.dto.js';

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

export enum ComponentsTypeInUsecase {
  TopLevel = 'TopLevelComponents', //only top level components and links of a usecase. If a subsystem is included, its internal components are not returned.
  LowLevelComponents = 'LowLevelComponents', //only modules and links of a usecase.
  AllComponents = 'AllComponents', //all components of a usecase, including subystem and its internal componnents (even nested subsystem and its internal components)
}

export class UsecaseIdentifier extends KVInfo {
  private _usecaseAliasId?: number;
  private _usecaseAliasName?: string;
  private _usecaseCategory?: string;
  private _usecaseType: UsecaseType;
  private _relatedEndPointLinks?: EndPointLink[];

  @ApiProperty({
    description: 'Optional alias identifier for the usecase',
    type: Number,
    required: false,
  })
  get usecaseAliasId(): number | undefined {
    return this._usecaseAliasId;
  }

  set usecaseAliasId(value: number | undefined) {
    this._usecaseAliasId = value;
  }

  @ApiProperty({
    description: 'Alias name for the usecase',
    type: String,
    required: false,
  })
  get usecaseAliasName(): string | undefined {
    return this._usecaseAliasName;
  }

  set usecaseAliasName(value: string | undefined) {
    this._usecaseAliasName = value;
  }

  @ApiProperty({
    description: 'Category of the usecase',
    type: String,
    required: false,
  })
  get usecaseCategory(): string | undefined {
    return this._usecaseCategory;
  }

  set usecaseCategory(value: string | undefined) {
    this._usecaseCategory = value;
  }

  @ApiProperty({
    description: 'Type of the usecase',
    enum: UsecaseType,
  })
  get usecaseType(): UsecaseType {
    return this._usecaseType;
  }

  set usecaseType(value: UsecaseType) {
    this._usecaseType = value;
  }

  @ApiProperty({
    description: 'Related endpoint links for the usecase',
    type: [EndPointLink],
    required: false,
  })
  get relatedEndPointLinks(): EndPointLink[] | undefined {
    return this._relatedEndPointLinks;
  }

  constructor(
    systemId: string,
    useCaseType: UsecaseType,
    kvInfo: KVInfo,
    aliasId?: number,
    aliasName?: string,
    category?: string,
  ) {
    super(kvInfo.keyValueCollection as KeyValueInfo[]);
    this._usecaseType = useCaseType;
    this.systemId = systemId;
    this._usecaseAliasId = aliasId;
    this._usecaseAliasName = aliasName;
    this._usecaseCategory = category;

    const link = new EndPointLink();
    link.hypertextRef = `/usecases/components/get`;
    link.method = 'POST';
    link.description = 'Get all components of usecase.';
    this._relatedEndPointLinks = [link];
  }
}

export class UsecaseDto {
  private _usecases: UsecaseIdentifier[];

  @ApiProperty({
    description:
      'Indicates whether this usecase has subsystem filtering applied. ' +
      'false = No FilteredKV (null). All UsecaseIdentifiers without subsystem are grouped together.' +
      'true = Has a FilteredKV. All UsecaseIdentifiers filtered by this FilteredKV are grouped together',
    type: Boolean,
    example: false,
  })
  @ApiProperty({
    description: 'Array of usecase identifiers. ',
    type: [UsecaseIdentifier],
  })
  @IsArray()
  @ArrayMaxSize(1)
  get usecases(): UsecaseIdentifier[] {
    return this._usecases;
  }

  /**
   * Constructor for raw GKV scenario (no subsystem filtering)
   * @param rawUsecase Single usecase identifier representing the raw GKV
   */
  constructor(rawUsecase: UsecaseIdentifier);

  /**
   * Constructor for filtered GKV scenario (subsystem filtering applied)
   * @param systemId System identifier for the filtered KV
   * @param filteredKv Subsystem filtered key-value information
   * @param usecases List of raw GKVs under the filtered GKV
   */
  constructor(
    systemId: string,
    filteredKv: KVInfo,
    usecases: UsecaseIdentifier[],
  );

  constructor(
    rawUsecaseOrSystemId: UsecaseIdentifier | string,
    filteredKv?: KVInfo,
    usecases?: UsecaseIdentifier[],
  ) {
    if (typeof rawUsecaseOrSystemId === 'string') {
      // Filtered GKV scenario (Scenario 2)
      if (!filteredKv || !usecases) {
        throw new Error(
          'filteredKv and usecases are required for filtered scenario',
        );
      }
      this._usecases = usecases;
    } else {
      // Raw GKV scenario (Scenario 1)
      this._usecases = [rawUsecaseOrSystemId];
    }
  }

  /**
   * Static factory method for creating raw GKV response
   */
  static createRawGKVResponse(usecase: UsecaseIdentifier): UsecaseDto {
    return new UsecaseDto(usecase);
  }

  /**
   * Static factory method for creating filtered GKV response
   */
  static createFilteredGKVResponse(
    systemId: string,
    filteredKv: KVInfo,
    usecases: UsecaseIdentifier[],
  ): UsecaseDto {
    return new UsecaseDto(systemId, filteredKv, usecases);
  }

  /**
   * Validates the data integrity of the DTO
   * Ensures that when isFiltered is false, filteredKV is null and usecases has exactly one item
   * Ensures that when isFiltered is true, filteredKV is not null and usecases has at least one item
   */
  validate(): {isValid: boolean; errors: string[]} {
    const errors: string[] = [];

    if (this._usecases.length === 0) {
      errors.push(
        'usecases array must contain at least one item when isFiltered is true',
      );
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
        `SubsystemFilteredUsecase validation failed: ${validation.errors.join(', ')}`,
      );
    }
  }
}

/**
 * Full usecases information including usecase identifier and all its
 * components (module-instances, data links, control links, dangling links).
 */
export class UsecaseWithComponents {
  private _usecaseIdentifier: UsecaseIdentifier;
  private _components: BaseComponentDto<number>[];

  @ApiProperty({
    description: 'Usecase identifier information',
    type: UsecaseIdentifier,
  })
  get usecaseIdentifier(): UsecaseIdentifier {
    return this._usecaseIdentifier;
  }

  @ApiProperty({
    description: 'Array of components in the usecase',
    type: [BaseComponentDto],
  })
  get components(): BaseComponentDto<number>[] {
    return this._components;
  }

  set components(value: BaseComponentDto<number>[]) {
    this._components = value;
  }

  constructor(usecaseId: UsecaseIdentifier) {
    this._usecaseIdentifier = usecaseId;
    this._components = [];
  }
}

export class UsecaseWithModificationSummary {
  private _usecase: UsecaseWithComponents;
  private _usecaseModification: ModificationAction;
  private _modificationSummary: string;

  @ApiProperty({
    description: 'Usecase with components information',
    type: UsecaseWithComponents,
  })
  get usecase(): UsecaseWithComponents {
    return this._usecase;
  }

  @ApiProperty({
    description: 'Type of modification action performed on the usecase',
    enum: ModificationAction,
  })
  get usecaseModification(): ModificationAction {
    return this._usecaseModification;
  }

  @ApiProperty({
    description: 'Summary of the modifications made to the usecase',
    type: String,
  })
  get modificationSummary(): string {
    return this._modificationSummary;
  }

  constructor(
    usecaseWithComponents: UsecaseWithComponents,
    usecaseModificaiton: ModificationAction,
    summary: string,
  ) {
    this._usecase = usecaseWithComponents;
    this._usecaseModification = usecaseModificaiton;
    this._modificationSummary = summary;
  }
}

/**
 * DTO containing all components of a usecase organized by type
 */
export class UsecaseComponentsDto {
  private _usecaseIdentifier: UsecaseIdentifier;
  @ApiProperty({
    description: 'Usecase identifier information',
    type: UsecaseIdentifier,
  })
  get usecaseIdentifier(): UsecaseIdentifier {
    return this._usecaseIdentifier;
  }

  @ApiProperty({
    description: 'List of subsystems in the usecase',
    type: [SubsystemDto],
  })
  subsystems!: SubsystemDto[];

  @ApiProperty({
    description: 'List of module instances in the usecase',
    type: [ModuleInstanceDto],
  })
  moduleInstances!: ModuleInstanceDto[];

  @ApiProperty({
    description: 'List of data links in the usecase',
    type: [DataLinkDto],
  })
  dataLinks!: DataLinkDto[];

  @ApiProperty({
    description: 'List of control links in the usecase',
    type: [ControlLinkDto],
  })
  controlLinks!: ControlLinkDto[];

  constructor(usecaseId: UsecaseIdentifier) {
    this._usecaseIdentifier = usecaseId;
  }
}
