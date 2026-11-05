import { makeWorld, suite, across } from './lib.mjs';
const { ok, group, done } = suite('online tahkim: mandatory reason, chess clock');
const MIN = 60000, INC = 5000;
async function afterFirstMove() {
  const w = makeWorld(); await w.start({ minutes: 10 });
  w.giveRack('A', [...'كتاب']); await w.call('A', 'snapshot');
  const mv = await w.call('A', 'submit_move', { placements: across(w.snap.A, 'كتاب') }); ok(mv.ok, 'A plays a word');
  await w.call('B', 'snapshot'); return w;
}

group('placed tiles remember who placed them');
{
  const w = await afterFirstMove(); const s = (await w.call('B', 'snapshot')).snapshot;
  const tiles = (s.board || s.game.board).flat().filter(Boolean);
  ok(tiles.length === 4 && tiles.every(t => t.o === 0), 'all 4 tiles carry the placer seat (A = 0): ' + tiles.map(t => t.o));
}

group('+5 s per move, nothing for pass / swap');
{
  const w = await afterFirstMove();
  const s = (await w.call('B', 'snapshot')).snapshot;
  ok(s.players[0].ms_left === 10 * MIN + INC, 'the mover got +5 s: ' + s.players[0].ms_left);
  ok(s.players[1].ms_left === 10 * MIN, 'the opponent did not');
  const p = await w.call('B', 'pass_turn'); ok(p.ok && p.snapshot.players[1].ms_left === 10 * MIN, 'a pass adds nothing');
}

group('a reason is mandatory');
{
  const w = await afterFirstMove();
  for (const bad of [undefined, '', '   ', 'ab', 42]) { const r = await w.call('B', 'request_tahkim', { reason: bad }); ok(!r.ok && r.code === 'REASON_REQUIRED', `reason ${JSON.stringify(bad)} refused (${r.code})`); }
  const long = await w.call('B', 'request_tahkim', { reason: 'x'.repeat(200) }); ok(!long.ok, 'an overlong reason is refused');
  const r = await w.call('B', 'request_tahkim', { reason: '  كتابي \n إضافة  ' });
  ok(r.ok && r.snapshot.game.status === 'tahkim_pending' && r.snapshot.game.tahkim.state === 'pending', 'a valid reason opens the discussion at once (no approval step)');
  ok(r.snapshot.game.tahkim.reason === 'كتابي إضافة', 'the reason is cleaned: ' + r.snapshot.game.tahkim.reason);
  ok(r.snapshot.waiting_seat === 0, 'each player is waiting for the other one');
}

group('undo accepted gives the +5 s back');
{
  const w = await afterFirstMove(); await w.call('A', 'request_undo'); await w.call('B', 'snapshot');
  const u = await w.call('B', 'respond_undo', { accept: true }); ok(u.ok, 'undo accepted');
  ok(u.snapshot.players[0].ms_left === 10 * MIN, 'the mover is back at the clock before the move: ' + u.snapshot.players[0].ms_left);
}
done();
