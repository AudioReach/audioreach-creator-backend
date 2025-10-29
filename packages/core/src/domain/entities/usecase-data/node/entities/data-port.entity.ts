export const PortIoType = {
  Input: 'Input',
  Output: 'Output',
} as const;

export type PortIoType = (typeof PortIoType)[keyof typeof PortIoType];

export class DataPortEntity {
  readonly systemId: number;
  readonly dataPortId: number;
  readonly portIoType: PortIoType;
  readonly isStatic: boolean;
  readonly name?: string;

  constructor(params: {
    systemId: number;
    dataPortId: number;
    portIoType: PortIoType;
    isStatic: boolean;
    name?: string;
  }) {
    this.systemId = params.systemId;
    this.dataPortId = params.dataPortId;
    this.portIoType = params.portIoType;
    this.isStatic = params.isStatic;
    this.name = params.name;
  }
}
