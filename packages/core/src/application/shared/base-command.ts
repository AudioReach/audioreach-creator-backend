import { Command } from "@application/orchestration/cqrs/commands/command";
import { generateUuid } from "@shared/utilities/uuid";

/**
 * Base abstract class for commands with auto-generated ID and timestamp
 */
export abstract class BaseCommand implements Command {
  readonly id: string = generateUuid();
  readonly timeStamp: Date = new Date();

  constructor(public readonly clientId?: string) {}
}
