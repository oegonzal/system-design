import { randomUUID } from 'node:crypto';

import {
  sessionTitleOf,
  type StartToolSessionRequest,
  type ToolSessionRecord,
} from '@sysdesign/contracts';

import type { ToolCatalog, ToolProvider } from '../catalog';
import type { ToolSessionSettings } from '../settings';
import type { SessionDeps } from './ports';
import { runSession } from './session-loop';

/** A running session as the registry holds it: its record, its stop, and its end. */
interface Held {
  record: ToolSessionRecord;
  controller: AbortController;
  done: Promise<ToolSessionRecord>;
}

/** What a session is withdrawn with when its program stops it. */
const STOPPING = { reason: 'abandoned', note: 'the session is stopping' } as const;

/**
 * Every session the program runs, in memory: each is started detached from
 * the request that asked for it, keeps its record as it is written, and ends
 * on its own, its signal, or the program's shutdown. Another program's tools
 * are fetched as a session starts, so a peer that cannot be reached refuses
 * the start by name rather than failing the session later.
 */
export class SessionRegistry {
  private readonly held = new Map<string, Held>();

  constructor(
    private readonly deps: SessionDeps,
    private readonly service: string,
    private readonly settings: ToolSessionSettings,
    private readonly peers: readonly ToolProvider[] = [],
  ) {}

  async start(request: StartToolSessionRequest): Promise<ToolSessionRecord> {
    const catalog = await this.catalogWithPeers();
    const record: ToolSessionRecord = {
      id: randomUUID(),
      service: this.service,
      title: sessionTitleOf(request.mission),
      mission: request.mission,
      status: 'running',
      criteria: null,
      steps: [],
      startedAt: this.deps.clock().toISOString(),
      endedAt: null,
      ending: null,
    };
    const rails = {
      ...this.settings.rails,
      ...(request.maxSteps === undefined ? {} : { maxSteps: request.maxSteps }),
      ...(request.maxMinutes === undefined ? {} : { maxMinutes: request.maxMinutes }),
    };
    const controller = new AbortController();
    const done = runSession(
      { ...this.deps, catalog },
      { record, rails, settings: this.settings, signal: controller.signal },
    );
    this.held.set(record.id, { record, controller, done });
    return record;
  }

  get(id: string): ToolSessionRecord | null {
    return this.held.get(id)?.record ?? null;
  }

  /** Every session, newest first. */
  list(): ToolSessionRecord[] {
    return [...this.held.values()].map((held) => held.record).reverse();
  }

  /** Tells a session to stop after the step in flight; false for one the registry does not hold. */
  stop(id: string): boolean {
    const held = this.held.get(id);
    if (held === undefined) return false;
    if (held.record.status === 'running') held.controller.abort(STOPPING);
    return true;
  }

  /** The record once the session has ended; null for one the registry does not hold. */
  finished(id: string): Promise<ToolSessionRecord> | null {
    return this.held.get(id)?.done ?? null;
  }

  /** Every running session told to stop, and every end awaited: the program is shutting down. */
  async onModuleDestroy(): Promise<void> {
    for (const held of this.held.values()) {
      if (held.record.status === 'running') held.controller.abort(STOPPING);
    }
    await Promise.allSettled([...this.held.values()].map((held) => held.done));
  }

  private async catalogWithPeers(): Promise<ToolCatalog> {
    let catalog = this.deps.catalog;
    for (const peer of this.peers) catalog = catalog.with(await peer.tools());
    return catalog;
  }
}
