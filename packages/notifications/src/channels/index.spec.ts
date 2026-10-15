import { z } from 'zod';

import { channelSettingsSchemaOf, createChannels, describeChannels } from './index';
import type { ChannelDefinition } from './port';
import { FakeChannel } from './testing';

/** What each instance of a kind was built from. */
const built: { id: string; settings: unknown; env: unknown; variables: unknown }[] = [];

/** A channel kind for the spec alone: every instance is a fake channel under the instance's id. */
const PAGER: ChannelDefinition = {
  id: 'pager',
  settings: z.strictObject({ volume: z.number() }),
  env: {
    token: { required: true, distinct: true },
    room: { required: false, distinct: false },
  },
  create: ({ id, settings, env, variables }) => {
    built.push({ id, settings, env, variables });
    return new FakeChannel(id);
  },
};
const BEEPER: ChannelDefinition = { ...PAGER, id: 'beeper' };

const bound = { token: 'DESK_TOKEN', room: 'ROOM' };
const kindOf = (instances: Record<string, unknown>) => ({ settings: { volume: 3 }, instances });

describe('the channel instances', () => {
  it('[NTF-12] runs every instance a kind declares, under its own id and variables, beside the publishers it carries', () => {
    const settings = channelSettingsSchemaOf([PAGER]).parse({
      pager: kindOf({
        'pager.desk': { carries: ['north'], env: bound },
        'pager.field': { carries: ['south', 'west'], env: { token: 'FIELD_TOKEN', room: 'ROOM' } },
      }),
    });
    const env = { 'pager.desk': { token: 'one', room: 'r' }, 'pager.field': { token: 'two' } };
    const running = createChannels([PAGER], settings, env, () => ({
      log: () => undefined,
      warn: () => undefined,
    }));

    expect(running.map(({ channel, carries }) => [channel.id, carries])).toEqual([
      ['pager.desk', ['north']],
      ['pager.field', ['south', 'west']],
    ]);
    expect(built).toEqual([
      { id: 'pager.desk', settings: { volume: 3 }, env: env['pager.desk'], variables: bound },
      {
        id: 'pager.field',
        settings: { volume: 3 },
        env: env['pager.field'],
        variables: { token: 'FIELD_TOKEN', room: 'ROOM' },
      },
    ]);
    expect(describeChannels(settings)).toBe(
      'pager.desk carries north; pager.field carries south, west',
    );
    expect(describeChannels({})).toBe('none');
  });

  it('[NTF-12] refuses an instance that leaves a key unbound, carries nothing or is misnamed, a kind with none, and one id in two kinds', () => {
    const schema = channelSettingsSchemaOf([PAGER, BEEPER]);
    const instance = { carries: ['north'], env: bound };
    expect(schema.safeParse({ pager: kindOf({ 'pager.desk': instance }) }).success).toBe(true);

    const refused = [
      { pager: kindOf({ 'pager.desk': { ...instance, env: { token: 'DESK_TOKEN' } } }) },
      { pager: kindOf({ 'pager.desk': { ...instance, carries: [] } }) },
      { pager: kindOf({ 'pager.desk': { ...instance, env: { ...bound, room: 'room' } } }) },
      { pager: kindOf({ 'Pager Desk': instance }) },
      // Longer than an answer may name the channel it came by.
      { pager: kindOf({ [`pager.${'d'.repeat(40)}`]: instance }) },
      { pager: kindOf({}) },
      { pager: kindOf({ 'shared.id': instance }), beeper: kindOf({ 'shared.id': instance }) },
    ];
    for (const settings of refused) expect(schema.safeParse(settings).success).toBe(false);
  });
});
