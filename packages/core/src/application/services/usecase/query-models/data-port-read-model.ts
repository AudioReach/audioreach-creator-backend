export interface DataPortReadModel {
  readonly systemId: number;
  readonly portId: number;
  readonly name: string;
  readonly portIoType: string;
  readonly isStatic: boolean;
}
