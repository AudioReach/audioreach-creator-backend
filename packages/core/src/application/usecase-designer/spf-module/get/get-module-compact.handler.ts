import { ModuleCompactView } from "@application/services/module/query-models/module-compact";
import { GetModuleCompactQuery } from "./get-module-compact.query";
import { QueryHandler } from "@application/orchestration/cqrs/queries/query-handler";
import { QueryServices } from "@application/services/query-services";

export class GetModuleCompactHandler
  implements QueryHandler<GetModuleCompactQuery, ModuleCompactView>
{
  constructor(private queryServices: QueryServices) {}

  handle(_query: GetModuleCompactQuery): ModuleCompactView {
    // TODO: Implement actual module query logic - will include querying from read models, applying filters, and returning proper domain data
    console.warn("GetModuleCompactHandler: Using placeholder implementation");
    console.warn("UnitOfWork available:", !!this.queryServices);

    return new ModuleCompactView(
      -1, // systemId: -1 indicates placeholder
      "Placeholder Module", // name
      "placeholder", // alias
      false, // isEnabled: false for safety
    );
  }
}
