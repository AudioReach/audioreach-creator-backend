export class ModuleCompactView {
  constructor(
    public readonly systemId: number,
    public readonly name: string,
    public readonly alias: string,
    public readonly isEnabled: boolean,
  ) {}
}
