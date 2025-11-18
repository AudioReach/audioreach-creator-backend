import type {IntentReadModel} from './intent-read-model.js';

export interface ControlPortReadModel {
  readonly systemId: number;
  readonly portId: number;
  readonly name: string;
  readonly isStatic: boolean;
  readonly allocatedIntents: IntentReadModel[];
}
