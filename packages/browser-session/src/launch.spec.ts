import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKAGE_ROOT, SessionConfigError } from './config';
import { SPEC_RAILS } from './core/testing-session';
import {
  documentsWithLaunch,
  exportOrigins,
  railsWithLaunch,
  readLaunch,
  readLaunches,
  type Launch,
} from './launch';

describe('a launch file', () => {
  it('[BRW-29] declares the shipped launches — linkedin and builtin — with their goals under goals/, their documents resolved under the documents dir, and no subject', () => {
    expect(readdirSync(join(PACKAGE_ROOT, 'launches')).sort()).toEqual([
      'builtin.json',
      'linkedin.json',
    ]);
    expect(readLaunch(PACKAGE_ROOT, 'linkedin', 'docs/ingestion')).toEqual({
      name: 'linkedin',
      goal: 'packages/browser-session/goals/linkedin-easy-apply.md',
      profile: 'linkedin',
      url: 'https://www.linkedin.com/jobs/search-results/?keywords=easy%20apply%20software%20engineer%20remote&f_AL=true&f_TPR=r86400',
      documents: [],
      targetDone: 6,
      maxTasks: 9,
      maxMinutes: 120,
    });
    expect(readLaunch(PACKAGE_ROOT, 'builtin', '/app/static/docs')).toEqual({
      name: 'builtin',
      goal: 'packages/browser-session/goals/builtin-apply.md',
      profile: 'builtin',
      url: 'https://builtin.com/jobs/remote/hybrid?search=Software+Engineer&city=Los+Angeles&state=California&country=USA&allLocations=true',
      documents: [{ name: 'resume', path: '/app/static/docs/Resume_2026_c.pdf' }],
      targetDone: 4,
      maxTasks: 8,
      maxMinutes: 90,
    });
    // Each goal a launch names is a file the package ships, by its path from the repository root.
    const launches = readLaunches(PACKAGE_ROOT, 'docs');
    expect(launches.map((launch) => launch.name)).toEqual(['builtin', 'linkedin']);
    for (const { goal } of launches) {
      expect(existsSync(join(PACKAGE_ROOT, '..', '..', goal)), goal).toBe(true);
    }
    // An export of a profile visits the site of each launch that names it, and the site --url names, once each.
    expect(exportOrigins('linkedin', launches, undefined)).toEqual(['https://www.linkedin.com']);
    expect(exportOrigins('builtin', launches, 'https://builtin.com/jobs?x=1')).toEqual([
      'https://builtin.com',
    ]);
    expect(exportOrigins('smoke', launches, undefined)).toEqual([]);
    expect(exportOrigins('smoke', launches, 'https://duckduckgo.com/?q=x')).toEqual([
      'https://duckduckgo.com',
    ]);
    expect(() => exportOrigins('smoke', launches, 'nowhere')).toThrow(
      '--url must be a URL, got "nowhere"',
    );
  });

  it('[BRW-29] refuses by name a launch nobody declares, listing the known ones, and a file the schema does not read, naming the field', () => {
    expect(() => readLaunch(PACKAGE_ROOT, 'nope', 'docs')).toThrow(SessionConfigError);
    expect(() => readLaunch(PACKAGE_ROOT, 'nope', 'docs')).toThrow(
      '--launch "nope" names no launch file under',
    );
    expect(() => readLaunch(PACKAGE_ROOT, 'nope', 'docs')).toThrow('known: builtin, linkedin');
    // A name is never a path.
    expect(() => readLaunch(PACKAGE_ROOT, '../config/engine', 'docs')).toThrow(
      'names no launch file',
    );

    const root = mkdtempSync(join(tmpdir(), 'browser-session-launches-'));
    mkdirSync(join(root, 'launches'));
    const write = (name: string, launch: unknown): void =>
      writeFileSync(
        join(root, 'launches', `${name}.json`),
        typeof launch === 'string' ? launch : JSON.stringify(launch),
      );
    const good = { goal: 'goals/x.md', profile: 'p', url: 'https://x.test/' };
    try {
      write('ok', good);
      expect(readLaunch(root, 'ok', '/docs')).toEqual({ name: 'ok', ...good, documents: [] });
      write('goal', { ...good, goal: 'goals/x.txt' });
      expect(() => readLaunch(root, 'goal', '/docs')).toThrow('goal must be a markdown file');
      write('url', { ...good, url: 'jobs' });
      expect(() => readLaunch(root, 'url', '/docs')).toThrow(/url /);
      write('doc', { ...good, documents: { resume: '../secret.pdf' } });
      expect(() => readLaunch(root, 'doc', '/docs')).toThrow(
        'documents.resume must be a bare file name',
      );
      write('doc-name', { ...good, documents: { Resume: 'r.pdf' } });
      expect(() => readLaunch(root, 'doc-name', '/docs')).toThrow(/documents/);
      write('target', { ...good, targetDone: 5, maxTasks: 3 });
      expect(() => readLaunch(root, 'target', '/docs')).toThrow('targetDone is above maxTasks');
      // The subject is a person's name and stays out of a tracked file: an unknown key is refused.
      write('subject', { ...good, subject: 'Alex Example' });
      expect(() => readLaunch(root, 'subject', '/docs')).toThrow(/subject/);
      write('broken', '{');
      expect(() => readLaunch(root, 'broken', '/docs')).toThrow('is not JSON');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('[BRW-29] lays the launch’s limits over the settings’ — the flags then over both — and replaces a launch document by a flag naming the same document', () => {
    const launch: Launch = {
      name: 'l',
      goal: 'g.md',
      profile: 'p',
      url: 'https://x.test/',
      documents: [
        { name: 'resume', path: '/docs/r.pdf' },
        { name: 'cover-letter', path: '/docs/c.pdf' },
      ],
      targetDone: 2,
      maxMinutes: 45,
    };
    expect(railsWithLaunch(launch, SPEC_RAILS)).toEqual({
      ...SPEC_RAILS,
      targetDone: 2,
      maxMinutes: 45,
    });
    expect(railsWithLaunch(null, SPEC_RAILS)).toBe(SPEC_RAILS);
    expect(documentsWithLaunch([{ name: 'resume', path: '/tmp/new.pdf' }], launch)).toEqual([
      { name: 'cover-letter', path: '/docs/c.pdf' },
      { name: 'resume', path: '/tmp/new.pdf' },
    ]);
    expect(documentsWithLaunch([{ name: 'resume', path: '/tmp/new.pdf' }], null)).toEqual([
      { name: 'resume', path: '/tmp/new.pdf' },
    ]);
  });
});
