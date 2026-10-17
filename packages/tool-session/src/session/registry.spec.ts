import { TOOL_MISSION_FIXTURE, type ToolPlan } from '@sysdesign/contracts';

import { PeerUnreachable, type ToolProvider } from '../catalog';
import { SessionRegistry } from './registry';
import { fakeDeps, FakeLoopClient, okTool, sampleSettings } from './testing';

const finishing: ToolPlan = {
  assessment: 'Done.',
  calls: [],
  ask: null,
  finish: { cause: 'nothing-left', detail: 'all noted' },
};
const listing: ToolPlan = {
  assessment: 'List.',
  calls: [{ tool: 'peer_tool', argumentsJson: '{}', reason: 'peer', expect: null, serves: [] }],
  ask: null,
  finish: null,
};

describe('the session registry', () => {
  it('[TSS-4] starts a session detached with the peers’ tools beside its own, keeps its record as it is written, lists newest first, and answers its end', async () => {
    const loop = new FakeLoopClient([{ artifact: listing }, { artifact: finishing }]);
    const peerTool = okTool('peer_tool');
    const peer: ToolProvider = {
      tools: () =>
        Promise.resolve([
          { ...peerTool, declaration: { ...peerTool.declaration, provider: 'peer' } },
        ]),
    };
    const registry = new SessionRegistry(
      fakeDeps(loop, [okTool('list_items')]),
      'example',
      sampleSettings(),
      [peer],
    );
    const started = await registry.start({ mission: TOOL_MISSION_FIXTURE, maxSteps: 4 });
    expect(started).toMatchObject({
      service: 'example',
      status: 'running',
      title: expect.stringContaining('Keep the list'),
    });
    expect(registry.get(started.id)).toBe(started);
    const ended = await registry.finished(started.id);
    expect(ended?.status).toBe('complete');
    expect(ended?.steps[0]?.calls[0]).toMatchObject({ tool: 'peer_tool', outcome: 'ok' });
    expect(loop.starts[0]?.goal).toContain('From fake:');
    expect(loop.starts[0]?.goal).toContain('From peer:');
    const second = await registry.start({ mission: TOOL_MISSION_FIXTURE });
    expect(registry.list().map((record) => record.id)).toEqual([second.id, started.id]);
    expect(registry.get('nope')).toBeNull();
    expect(registry.finished('nope')).toBeNull();
    expect(registry.stop('nope')).toBe(false);
  });

  it('[TSS-4] refuses a start whose peer cannot be reached, by name, and stops every running session when the program shuts down', async () => {
    const dead: ToolProvider = {
      tools: () => Promise.reject(new PeerUnreachable('http://dead.test', 'ECONNREFUSED')),
    };
    const refusing = new SessionRegistry(
      fakeDeps(new FakeLoopClient([]), []),
      'example',
      sampleSettings(),
      [dead],
    );
    await expect(refusing.start({ mission: TOOL_MISSION_FIXTURE })).rejects.toThrow(
      PeerUnreachable,
    );

    const hanging = new FakeLoopClient([
      () => {
        return { artifact: listing };
      },
    ]);
    const registry = new SessionRegistry(
      fakeDeps(hanging, [okTool('peer_tool')]),
      'example',
      sampleSettings(),
    );
    const started = await registry.start({ mission: TOOL_MISSION_FIXTURE });
    expect(registry.stop(started.id)).toBe(true);
    const ended = await registry.finished(started.id);
    expect(ended?.ending?.cause).toBe('stop-signal');
    await registry.onModuleDestroy();
  });
});
