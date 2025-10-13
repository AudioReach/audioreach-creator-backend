import {ModuleCompactView} from '../../../services/module/query-models/module-compact.js';
import {GetModuleCompactQuery} from './get-module-compact.query.js';
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../services/query-services.js';

export class GetModuleCompactHandler
  implements QueryHandler<GetModuleCompactQuery, ModuleCompactView>
{
  constructor(private queryServices: QueryServices) {}

  handle(_query: GetModuleCompactQuery): ModuleCompactView {
    // TODO: Implement actual module query logic - will include querying from read models, applying filters, and returning proper domain data
    console.warn('GetModuleCompactHandler: Using placeholder implementation');
    console.warn('UnitOfWork available:', !!this.queryServices);

    return new ModuleCompactView(
      -1, // systemId: -1 indicates placeholder
      'Placeholder Module', // name
      'placeholder', // alias
      false, // isEnabled: false for safety
    );
  }
}
