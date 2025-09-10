import { BaseCommand } from "@application/shared/base-command";

/**
 * Command to add a new module to the system
 * To Do: This is a partial implementation added for writing an exmaple in CQRS franework
 */
export class CreateModuleCommand extends BaseCommand {
  constructor(
    public readonly moduleDefinitionSystemId: number,
    public readonly containerSystemId: number,
    public readonly subgraphSystemId: number,
    public readonly moduleAlias?: string,
    userId?: string,
  ) {
    super(userId);
  }
}
