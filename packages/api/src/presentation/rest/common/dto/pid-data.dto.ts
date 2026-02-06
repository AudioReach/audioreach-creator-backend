import {ApiProperty} from '@nestjs/swagger';

export class BaseValueElement {
  /**
   * Name property (e.g. "enable")
   */
  @ApiProperty({description: 'Name property (e.g. "enable")'})
  public readonly name: string;

  /**
   * Type property (e.g. "uint32", "int16", etc.)
   */
  @ApiProperty({description: 'Type property (e.g. "uint32", "int16", etc.)'})
  public readonly type: string;

  /**
   * Value property (real value, e.g. 1, 2, 3, etc.)
   */
  @ApiProperty({description: 'Value property (real value, e.g. 1, 2, 3, etc.)'})
  public readonly value: string;

  /**
   * ValueLabel property (e.g. "Enable", etc.)
   */
  @ApiProperty({description: 'ValueLabel property (e.g. "Enable", etc.)'})
  public readonly valueLabel: string;

  constructor(name: string, type: string, value: string, valueLabel: string) {
    this.name = name;
    this.type = type;
    this.value = value;
    this.valueLabel = valueLabel;
  }
}

export class Struct extends BaseValueElement {
  /**
   * ChildrenList property
   */
  @ApiProperty({
    description: 'ChildrenList property',
    type: [BaseValueElement],
  })
  public readonly childrenList: BaseValueElement[];

  constructor(
    name: string,
    type: string,
    value: string,
    valueLabel: string,
    childrenList: BaseValueElement[],
  ) {
    super(name, type, value, valueLabel);
    this.childrenList = childrenList;
  }
}
