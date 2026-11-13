import { cosine, hashedUnitVector, recordingExecutor } from './testing';

describe('the recording executor', () => {
  it('[PGV-4] records every statement with its bound values and answers from the script: the rows, the first row, their count', async () => {
    const sql = recordingExecutor((statement, params) =>
      statement.startsWith('select') ? [{ id: params[0] }, { id: 'second' }] : undefined,
    );
    const select = 'select id from "vec_t" where payload->>\'kind\' = ?';
    expect(await sql.all(select, ['lesson'])).toEqual([{ id: 'lesson' }, { id: 'second' }]);
    expect(await sql.one(select, ['finding'])).toEqual({ id: 'finding' });
    expect(
      await sql.one('update "vec_t" set payload = payload where id = ?', ['b']),
    ).toBeUndefined();
    expect(await sql.run('delete from "vec_t" where id = ?', ['a'])).toEqual({ affectedRows: 0 });
    expect(sql.calls).toEqual([
      { sql: select, params: ['lesson'] },
      { sql: select, params: ['finding'] },
      { sql: 'update "vec_t" set payload = payload where id = ?', params: ['b'] },
      { sql: 'delete from "vec_t" where id = ?', params: ['a'] },
    ]);

    const counting = recordingExecutor(() => [{}, {}, {}]);
    expect(await counting.run('delete from "vec_t" where id = ?', ['c'])).toEqual({
      affectedRows: 3,
    });
  });

  it('[PGV-4] marks a transaction’s edges: commit after the callback returns, rollback when it throws, the throw kept', async () => {
    const sql = recordingExecutor();
    const done = await sql.transaction(async (tx) => {
      await tx.run('insert into "vec_t" values (?)', ['a']);
      return 'done';
    });
    expect(done).toBe('done');

    const failure = new Error('refused inside the transaction');
    await expect(
      sql.transaction(async (tx) => {
        await tx.run('insert into "vec_t" values (?)', ['b']);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(sql.calls.map((call) => call.sql)).toEqual([
      'BEGIN',
      'insert into "vec_t" values (?)',
      'COMMIT',
      'BEGIN',
      'insert into "vec_t" values (?)',
      'ROLLBACK',
    ]);
  });
});

describe('the vector math the fakes rank by', () => {
  it('[PGV-4] maps a text to one unit vector, and scores cosine as 1 - (a <=> b) does', () => {
    const a = hashedUnitVector('a lesson', 8);
    expect(a).toHaveLength(8);
    expect(Math.hypot(...a)).toBeCloseTo(1, 10);
    expect(hashedUnitVector('a lesson', 8)).toEqual(a);
    const opposite = a.map((value) => -value);
    const none = a.map(() => 0);
    expect(cosine(a, a)).toBeCloseTo(1, 10);
    expect(cosine(a, opposite)).toBeCloseTo(-1, 10);
    expect(cosine(a, none)).toBe(0);
  });
});
