import {ApiProperty} from '@nestjs/swagger';
import {BaseConnectableComponentDto} from '../../../common/dto/component.dto.js';
import {ComponentInfoType} from '../../../common/utils/enums.js';
import {KeyInfo} from '../../../common/dto/kv.dto.js';

/**
 * Represents a subsystem DTO
 */
export class SubsystemDto extends BaseConnectableComponentDto {
  @ApiProperty({
    description: 'Filtered keys assigned to the subsystem',
    type: [KeyInfo],
  })
  private _filteredKeys!: KeyInfo[];

  get componentType(): ComponentInfoType {
    return ComponentInfoType.Subsystem;
  }

  get filteredKeys(): KeyInfo[] {
    return this._filteredKeys;
  }

  set filteredKeys(value: KeyInfo[]) {
    this._filteredKeys = value;
  }

  constructor(systemId: string, id: number, name: string, parentId?: number) {
    super(systemId, id);
    this.name = name;
    this.parentId = parentId;
  }
}
