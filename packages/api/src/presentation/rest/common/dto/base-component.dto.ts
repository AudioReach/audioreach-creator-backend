import {ComponentInfoType} from '../utils/enums.js';
import {EndPointLink} from '../utils/utilities.js';
import {ApiProperty} from '@nestjs/swagger';

export type EditType = 'Added' | 'Updated' | 'Deleted' | 'None';

/**
 * Converted from C# abstract class BaseComponentDTO<T>
 */
export class BaseComponentDto<T> {
  protected _systemId!: string;
  protected _changeId!: string;
  protected _id!: T;
  private _name: string = '';
  private _relatedEndPointLinks: EndPointLink[] = [];
  private _editType: EditType = 'None';

  @ApiProperty({description: 'System ID'})
  get systemId(): string {
    return this._systemId;
  }

  @ApiProperty({description: 'Change ID'})
  get changeId(): string {
    return this._changeId;
  }

  @ApiProperty({
    description: 'Edit type',
    enum: ['Added', 'Updated', 'Deleted', 'None'],
  })
  get editType(): EditType {
    return this._editType;
  }

  @ApiProperty({description: 'Component ID'})
  get id(): T {
    return this._id;
  }

  @ApiProperty({description: 'Component name'})
  get name(): string {
    return this._name;
  }

  set name(value: string) {
    this._name = value;
  }

  @ApiProperty({
    description: 'Component type',
    enum: ComponentInfoType,
  })
  get componentType(): ComponentInfoType {
    throw new Error('componentType must be implemented by derived classes');
  }

  @ApiProperty({description: 'Related endpoint links', type: [EndPointLink]})
  get relatedEndPointLinks(): EndPointLink[] {
    return this._relatedEndPointLinks;
  }

  set relatedEndPointLinks(value: EndPointLink[]) {
    this._relatedEndPointLinks = value;
  }

  constructor(systemId: string, id?: T) {
    if (id) {
      this._id = id;
    }
    this._systemId = systemId;
  }
}
