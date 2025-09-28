import {Command} from '../orchestration/cqrs/commands/command.js';
import {generateUuid} from '../../shared/utilities/uuid.js';

/**
 * Base abstract class for commands with auto-generated ID and timestamp
 */
export abstract class BaseCommand implements Command {
  readonly id: string;
  readonly timeStamp: Date = new Date();

  constructor(public readonly clientId: string) {
    this.id = generateUuid();
  }
}
