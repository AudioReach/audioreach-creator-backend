import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {mergeJunitReports} from './merge-junit-reports.mjs';

test('merges the coverage package reports into the root JUnit file', async () => {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'junit-merge-'));
  const outputPath = path.join(
    rootDirectory,
    'test-results',
    'merged-results.xml',
  );

  try {
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, '<testsuites name="stale" tests="0"/>');

    for (const [packageName, xml] of [
      [
        'api',
        '<testsuites name="API" tests="2" failures="1" errors="0" time="2"><testsuite name="api-suite" tests="2" failures="1" errors="0" time="2"><testcase classname="api" name="fails"><failure message="failed"/></testcase><testcase classname="api" name="passes"/></testsuite></testsuites>',
      ],
      [
        'core',
        '<testsuites name="Core" tests="1" failures="0" errors="0" time="1"><testsuite name="core-suite" tests="1" failures="0" errors="0" time="1"><testcase classname="core" name="passes"/></testsuite></testsuites>',
      ],
    ]) {
      const packageResults = path.join(
        rootDirectory,
        'packages',
        packageName,
        'test-results',
      );
      await mkdir(packageResults, {recursive: true});
      await writeFile(path.join(packageResults, 'merged-results.xml'), xml);
    }

    await mergeJunitReports(rootDirectory);

    const mergedXml = await readFile(outputPath, 'utf8');
    assert.match(mergedXml, /<testsuites\b[^>]*tests="3"/);
    assert.match(mergedXml, /failures="1"/);
    assert.match(mergedXml, /name="api-suite"/);
    assert.match(mergedXml, /name="core-suite"/);
    assert.doesNotMatch(mergedXml, /name="stale"/);
  } finally {
    await rm(rootDirectory, {recursive: true, force: true});
  }
});

test('replaces a stale root report with a valid empty report when no package reports exist', async () => {
  const rootDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'junit-merge-empty-'),
  );
  const outputPath = path.join(
    rootDirectory,
    'test-results',
    'merged-results.xml',
  );

  try {
    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, '<testsuites name="stale" tests="0"/>');

    await mergeJunitReports(rootDirectory);

    const mergedXml = await readFile(outputPath, 'utf8');
    assert.match(mergedXml, /<testsuites\b[^>]*tests="0"/);
    assert.doesNotMatch(mergedXml, /name="stale"/);
  } finally {
    await rm(rootDirectory, {recursive: true, force: true});
  }
});
