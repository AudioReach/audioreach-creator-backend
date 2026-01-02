import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto} from './base-component.dto.js';
import {PortType} from './data-port.dto.js';

/**
 * Converted from C# class ControlPortIntentDTO
 */
export class ControlPortIntentDto {
  private _id: number;
  private _name: string;

  @ApiProperty({description: 'Intent ID'})
  get id(): number {
    return this._id;
  }

  @ApiProperty({description: 'Intent name'})
  get name(): string {
    return this._name;
  }

  set name(value: string) {
    this._name = value;
  }

  constructor(id: number, name: string) {
    this._id = id;
    this._name = name;
  }
}

export class ControlPortDto extends BaseComponentDto<number> {
  private _portType: PortType = PortType.Static;
  private _controlPortName: string = '';
  private _intents: ControlPortIntentDto[] = [];

  @ApiProperty({description: 'Port type', enum: PortType})
  get portType(): PortType {
    return this._portType;
  }

  @ApiProperty({description: 'Control port name'})
  get controlPortName(): string {
    return this._controlPortName;
  }

  set controlPortName(value: string) {
    this._controlPortName = value;
  }

  @ApiProperty({
    description: 'Control port intents',
    type: [ControlPortIntentDto],
  })
  get intents(): ControlPortIntentDto[] {
    return this._intents;
  }

  constructor(systemId: string, id: number);
  constructor(
    systemId: string,
    id: number,
    name: string,
    portType: PortType,
    intents: ControlPortIntentDto[],
  );
  constructor(
    systemId: string,
    id: number,
    name?: string,
    portType?: PortType,
    intents?: ControlPortIntentDto[],
  ) {
    super(systemId, id);

    if (name !== undefined && portType !== undefined && intents !== undefined) {
      this._portType = portType;
      this._intents = intents;
      this._controlPortName = name;
    }
  }
}
