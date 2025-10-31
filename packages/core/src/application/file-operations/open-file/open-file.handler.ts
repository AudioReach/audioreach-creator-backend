import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {OpenFileCommand} from './open-file.command.js';
import type {FileReaderPort} from './file-reader.port.js';
import {AcdbParser} from './parsers/acdb-parser.js';
import {AwspParser} from './parsers/awsp-parser.js';
import type {FileRef} from './file-ref.js';

export type OpenFileResult = {
  projectId: string;
  projectName: string;
  projectDescription: string;
};

export class OpenFileHandler
  implements CommandHandler<OpenFileCommand, OpenFileResult>
{
  private acdbParser: AcdbParser;
  private awspParser: AwspParser;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly fileReader: FileReaderPort,
  ) {
    this.acdbParser = new AcdbParser();
    this.awspParser = new AwspParser();
  }

  async handle(command: OpenFileCommand): Promise<OpenFileResult> {
    this.validateInputs(command.acdb, command.awsp);

    // Read files
    const [acdbBytes, awspBytes] = await Promise.all([
      this.fileReader.readAll(command.acdb),
      this.fileReader.readAll(command.awsp),
    ]);

    // Parse (placeholders)
    const [acdbParsed, awspParsed] = await Promise.all([
      this.acdbParser.parseACDB(acdbBytes),
      this.awspParser.parseAWSP(awspBytes),
    ]);

    // Transactional DB updates (placeholder)
    await this.uow.executeInTransaction(async () => {
      // TODO: Use parsed results (acdbParsed, awspParsed) to initialize DB.
      // Insert using repositories/query builders in dependency order.
      // No raw file bytes should be stored.
      void acdbParsed;
      void awspParsed;
    });

    return {
      projectId: 'PENDING_DB_ID',
      projectName: '', //TODO:
      projectDescription: '', //TODO:
    };
  }

  private validateInputs(acdb: FileRef, awsp: FileRef): void {
    const acdbName = acdb.kind === 'path' ? acdb.name : acdb.name;
    const awspName = awsp.kind === 'path' ? awsp.name : awsp.name;
    if (!acdbName?.toLowerCase().endsWith('.acdb')) {
      throw new Error('Invalid acdb file extension; expected .acdb');
    }
    if (!awspName?.toLowerCase().endsWith('.awsp')) {
      throw new Error('Invalid workspace file extension; expected .awsp');
    }
  }
}
