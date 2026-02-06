import {ApiProperty} from '@nestjs/swagger';

export class PortInfo {
  @ApiProperty({description: 'Unique identifier for the port'})
  portId!: number; // corresponds to uint

  @ApiProperty({description: 'Name of the port'})
  portName!: string;
}

export class DataPortInfo {
  @ApiProperty({description: 'Unique system identifier for the data port'})
  systemId!: string;

  @ApiProperty({description: 'Maximum number of ports'})
  maxPorts!: number; // corresponds to uint

  @ApiProperty({description: 'Array of port information', type: [PortInfo]})
  ports!: PortInfo[];
}

export class IntentInfo {
  @ApiProperty({description: 'Unique system identifier for the intent'})
  systemId!: string;

  @ApiProperty({description: 'Identifier of the intent'})
  intentId!: number; // corresponds to uint

  @ApiProperty({description: 'Name of the intent'})
  name!: string;

  @ApiProperty({description: 'Maximum number of ports for the intent'})
  maxPorts!: number; // corresponds to uint
}

/**
 * DTO representing a static control port, extending base port info.
 */
export class StaticCtrlPortInfo extends PortInfo {
  @ApiProperty({description: 'Unique system identifier for the ctrl port'})
  systemId!: string;

  @ApiProperty({
    description: 'List of intent information for the port',
    type: [IntentInfo],
  })
  portIntents!: IntentInfo[];
}
