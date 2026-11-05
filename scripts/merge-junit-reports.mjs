import {accessSync, constants, existsSync} from 'node:fs';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mergeToString} from 'junit-report-merger';

const packageReports = [
  'packages/api/test-results/merged-results.xml',
  'packages/core/test-results/merged-results.xml',
  'packages/infrastructure/persistence/test-results/merged-results.xml',
];

const emptyReport =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<testsuites name="AudioReach Creator Backend" tests="0" failures="0" errors="0" time="0"></testsuites>\n';

export async function mergeJunitReports(rootDirectory = process.cwd()) {
  const root = path.resolve(rootDirectory);
  const outputPath = path.join(root, 'test-results', 'merged-results.xml');
  const inputPaths = packageReports
    .map(report => path.join(root, report))
    .filter(report => {
      if (!existsSync(report)) return false;
      accessSync(report, constants.R_OK);
      return true;
    });

  await mkdir(path.dirname(outputPath), {recursive: true});
  await rm(outputPath, {force: true});

  if (inputPaths.length === 0) {
    await writeFile(outputPath, emptyReport, 'utf8');
    return;
  }

  const reports = await Promise.all(
    inputPaths.map(report => readFile(report, 'utf8')),
  );
  await writeFile(outputPath, await mergeToString(reports), 'utf8');
}

const isDirectExecution =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  try {
    await mergeJunitReports();
  } catch (error) {
    console.error('Failed to merge JUnit reports:', error);
    process.exitCode = 1;
  }
}
