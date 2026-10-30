import { documentNamesOf } from '@sysdesign/contracts';

import type { SuppliedDocument } from './ports';
import { SessionRefused } from './unit-advice';

/**
 * The files a run supplies for the documents its mission declares, held to
 * each other before any row exists: a declared document with no file would
 * cut every upload the mission plans, a supplied file no section declares is
 * one nothing may upload, and a name supplied twice names no one file. Which
 * file is which is the command line's to say, and whether a file exists is
 * the module's, outside the engine, which reads no disk; nothing here names
 * a path into a plan, a goal or a history line.
 */
export function resolveDocuments(mission: string, supplied: readonly SuppliedDocument[]): void {
  const declared = documentNamesOf(mission);
  const names = supplied.map((document) => document.name);
  const twice = names.find((name, position) => names.indexOf(name) !== position);
  if (twice !== undefined) throw new SessionRefused(`document ${twice} is supplied twice`);
  const missing = declared.filter((name) => !names.includes(name));
  if (missing.length > 0) {
    throw new SessionRefused(
      `the mission declares the document${missing.length === 1 ? '' : 's'} ${missing.join(', ')} and the run supplies no file for ${missing.length === 1 ? 'it' : 'them'}: supply each by name`,
    );
  }
  const undeclared = names.filter((name) => !declared.includes(name));
  if (undeclared.length > 0) {
    throw new SessionRefused(
      `the run supplies ${undeclared.join(', ')}, which the mission declares no document for — it declares ${declared.join(', ') || 'none'}`,
    );
  }
}
