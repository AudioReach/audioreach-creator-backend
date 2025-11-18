import type {ContainerReadModel} from './container-read-model.js';
import type {SubgraphReadModel} from './subgraph-read-model.js';
import type {DataPortReadModel} from './data-port-read-model.js';
import type {ControlPortReadModel} from './control-port-read-model.js';

export interface ModuleReadModel {
  readonly systemId: number;
  readonly name: string;
  readonly instanceId: number;
  readonly definitionSystemId: number;
  readonly container: ContainerReadModel;
  readonly subgraph: SubgraphReadModel;
  readonly dataPorts: DataPortReadModel[];
  readonly controlPorts: ControlPortReadModel[];
}
