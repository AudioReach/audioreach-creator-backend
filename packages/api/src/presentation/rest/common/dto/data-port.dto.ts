import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto} from './base-component.dto.js';

/**
 * Converted from C# enum PortIoType
 */
export enum PortIoType {
  Input = 'Input',
  Output = 'Output',
}

/**
 * Converted from C# enum PortType
 */
export enum PortType {
  Static = 'Static',
  Dynamic = 'Dynamic',
}

/**
 * Converted from C# class DataPortDTO
 */
export class DataPortDto extends BaseComponentDto<number> {
  @ApiProperty({description: 'Port IO type', enum: PortIoType})
  portIoType!: PortIoType;

  @ApiProperty({description: 'Port type', enum: PortType})
  portType!: PortType;

  set dataPortName(value: string) {
    this.name = value;
  }

  constructor(systemId: string, id: number);
  constructor(
    systemId: string,
    id: number,
    name: string,
    portIoType: PortIoType,
    portType: PortType,
    isVirtual?: boolean,
  );
  constructor(
    systemId: string,
    id: number,
    name?: string,
    portIoType?: PortIoType,
    portType?: PortType,
  ) {
    super(systemId, id);

    if (
      name !== undefined &&
      portIoType !== undefined &&
      portType !== undefined
    ) {
      this.portIoType = portIoType;
      this.portType = portType;
      this.name = name;
    }
  }
}
