import {BaseCommand} from '../../shared/base-command.js';
import type {FileRef} from './file-ref.js';

export class OpenFileCommand extends BaseCommand {
  constructor(
    clientId: string,
    public readonly acdb: FileRef,
    public readonly awsp: FileRef,
  ) {
    super(clientId);
  }
}
