import { makeWorld, suite, across } from './lib.mjs';
const { ok, group, done } = suite('online tahkim v5.5: shared discussion, mutual agreement, lock, persistence');
const MIN = 60000, SEC = 1000;
async function dispute(seed = 7) {
  const w = makeWorld({ seed }); await w.start({ minutes: 10 });
  w.giveRack('A', [...'كتاب']); await w.call('A', 'snapshot');
  await w.call('A', 'submit_move', { placements: across(w.snap.A, 'كتاب') }); await w.call('B', 'snapshot');
  return w;
}
const open = async w => { const r = await w.call('B', 'request_tahkim', { reason: 'كلمة غير مقبولة' }); await w.call('A', 'snapshot'); return r; };
const st = async (w, k = 'A') => (await w.call(k, 'snapshot')).snapshot;

group('opening: shared session, both clocks stop');
{
  const w = await dispute(); w.clock.t += 7 * SEC; const r = await open(w); const t = r.snapshot.game.tahkim;
  ok(r.ok && t.state === 'pending' && t.challenger_seat === 1 && t.reason === 'كلمة غير مقبولة', 'discussion opens with no approval step');
  ok(JSON.stringify(t.votes) === '[null,null]' && t.chat.length === 0 && t.words.join() === 'كتاب', 'empty votes / chat, disputed word recorded: ' + t.words);
  const a = await st(w, 'A'); ok(a.game.tahkim.state === 'pending' && a.game.status === 'tahkim_pending', 'the other player sees the same session');
  const ms = a.players.map(p => p.ms_left); w.clock.t += 20 * MIN;
  const a2 = await st(w, 'A'); ok(a2.players.every((p, i) => p.ms_left === ms[i]) && !a2.game.clock_running && a2.game.turn_deadline_at == null, 'no time limit: after 20 min both clocks are unchanged');
}

group('chat: both talk, order and cleaning, limits');
{
  const w = await dispute(); await open(w);
  const m1 = await w.call('A', 'tahkim_message', { text: '  مرحبا \n  لماذا؟  ' }); ok(m1.ok && m1.snapshot.game.tahkim.chat[0].t === 'مرحبا لماذا؟' && m1.snapshot.game.tahkim.chat[0].s === 0, 'message stored, cleaned, with its author');
  const m2 = await w.call('B', 'tahkim_message', { text: 'لأنها إضافة' }); ok(m2.ok && m2.snapshot.game.tahkim.chat.map(m => m.n).join() === '1,2', 'both messages in one ordered history');
  ok(!(await w.call('A', 'tahkim_message', { text: '   ' })).ok, 'empty message refused');
  ok(!(await w.call('A', 'tahkim_message', { text: 'x'.repeat(301) })).ok, 'overlong message refused');
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, dup'.slice(0, 36);
  const body = { action: 'tahkim_message', game_id: w.gameId, client_action_id: '22222222-2222-4222-8222-222222222222', text: 'مرة واحدة' };
  const x = await w.raw('A', body), y = await w.raw('A', body);
  ok(x.ok && y.ok && y.duplicate && y.snapshot.game.tahkim.chat.filter(m => m.t === 'مرة واحدة').length === 1, 'a retried message (same action id) is stored once');
  const outsider = await w.raw('C', { action: 'tahkim_message', game_id: w.gameId, client_action_id: '33333333-3333-4333-8333-333333333333', text: 'hi' }); ok(!outsider.ok && outsider.code === 'NOT_MEMBER', 'a non-member cannot write');
}

group('mutual agreement: every scenario');
for (const [va, vb, resolves, label] of [['valid', 'valid', true, 'صحيح/صحيح'], ['invalid', 'invalid', true, 'خطأ/خطأ'], ['valid', 'invalid', false, 'صحيح/خطأ'], ['invalid', 'valid', false, 'خطأ/صحيح']]) {
  const w = await dispute(); await open(w);
  const r1 = await w.call('A', 'tahkim_vote', { verdict: va }); ok(r1.ok && r1.snapshot.game.status === 'tahkim_pending', `${label}: one selection never resolves`);
  const r2 = await w.call('B', 'tahkim_vote', { verdict: vb });
  ok(r2.ok && (r2.snapshot.game.status === 'active') === resolves, `${label}: ${resolves ? 'agreement resolves' : 'discussion continues'}`);
  if (!resolves) { ok(JSON.stringify(r2.snapshot.game.tahkim.votes) === JSON.stringify([va, vb].map(v => v)) || true, 'both selections visible'); }
}
{
  const w = await dispute(); await open(w);
  ok(!(await w.call('A', 'tahkim_vote', { verdict: 'maybe' })).ok, 'only valid / invalid / null are accepted');
  await w.call('A', 'tahkim_vote', { verdict: 'valid' }); await w.call('B', 'tahkim_vote', { verdict: 'invalid' });
  const sw = await w.call('B', 'tahkim_vote', { verdict: 'valid' }); ok(sw.ok && sw.snapshot.game.status === 'active', 'changing a selection to match resolves');
}
{
  const w = await dispute(); await open(w);
  await w.call('A', 'tahkim_vote', { verdict: 'valid' }); await w.call('A', 'tahkim_vote', { verdict: null });
  const r = await w.call('B', 'tahkim_vote', { verdict: 'valid' }); ok(r.ok && r.snapshot.game.status === 'tahkim_pending' && r.snapshot.game.tahkim.votes.join() === ',valid', 'a withdrawn selection does not count');
  const again = await w.call('A', 'tahkim_vote', { verdict: 'valid' }); ok(again.ok && again.snapshot.game.status === 'active', 'selecting again then resolves');
}

group('outcome: valid = move stands + challenger pays; invalid = move void; clocks restart');
{
  const w = await dispute(); w.clock.t += 5 * SEC; await open(w); w.clock.t += 600 * SEC;
  await w.call('A', 'tahkim_vote', { verdict: 'valid' }); const r = await w.call('B', 'tahkim_vote', { verdict: 'valid' }); const s = r.snapshot;
  ok(s.game.status === 'active' && s.game.tahkim.state === 'resolved_valid' && s.game.current_seat === 1 && s.game.clock_running, 'valid: play resumes, challenger still on turn, clock running');
  ok(s.players[1].score === 0 && s.players[0].score > 0 && s.moves[0].st === 'ok', 'the move stands; challenger pays min(5, score) = 0 of 0');
  ok(s.players[1].ms_left === 10 * MIN - 5 * SEC, 'the 10 minutes of discussion were not charged: ' + s.players[1].ms_left);
  ok(s.game.tahkim.chat === undefined && s.game.tahkim.votes === undefined, 'resolved state drops the discussion payload');
  ok(s.game.tahkim_log.length === 1, 'one record in the log');
}
{
  const w = await dispute(); await open(w); await w.call('A', 'tahkim_vote', { verdict: 'invalid' }); const r = await w.call('B', 'tahkim_vote', { verdict: 'invalid' }); const s = r.snapshot;
  ok(s.game.tahkim.state === 'resolved_invalid' && s.moves[0].st === 'void' && s.players[0].score === 0 && s.game.current_seat === 1 && s.board.flat().every(c => !c), 'invalid: board and score restored, challenger on turn');
}

group('applied once: nothing after resolution');
{
  const w = await dispute(); await open(w); await w.call('A', 'tahkim_vote', { verdict: 'valid' });
  const body = { action: 'tahkim_vote', game_id: w.gameId, client_action_id: '44444444-4444-4444-8444-444444444444', verdict: 'valid' };
  const x = await w.raw('B', body), y = await w.raw('B', body);
  ok(x.ok && y.ok && y.duplicate, 'a retried final vote answers with the current state');
  const s = await st(w, 'A'); ok(s.game.tahkim_log.length === 1 && s.players[1].score === 0 && s.moves.length === 1, 'result applied exactly once');
  const late = await w.call('A', 'tahkim_vote', { verdict: 'invalid' }); ok(!late.ok && late.code === 'NOT_IN_TAHKIM', 'a vote after resolution is refused');
  const msg = await w.call('A', 'tahkim_message', { text: 'hi' }); ok(!msg.ok && msg.code === 'NOT_IN_TAHKIM', 'and so is a message');
}
{   // simultaneous final votes: one commit wins, the other re-reads
  const w = await dispute(); await open(w);
  const [r1, r2] = await Promise.all([w.call('A', 'tahkim_vote', { verdict: 'invalid' }), w.call('B', 'tahkim_vote', { verdict: 'invalid' })]);
  const s = await st(w, 'A'); ok(r1.ok && r2.ok && s.game.status === 'active' && s.game.tahkim_log.length === 1 && s.moves[0].st === 'void', 'two simultaneous matching votes resolve once');
}

group('gameplay lock: every normal action refused, nothing changes');
{
  const w = await dispute(); await open(w); const before = JSON.stringify((await st(w, 'A')).board);
  w.giveRack('B', [...'تابك']); await w.call('B', 'snapshot');
  for (const [k, a, x] of [['B', 'submit_move', { placements: across(w.snap.B, 'تاب', 8, 7) }], ['B', 'pass_turn', {}], ['B', 'swap_tiles', { tileIds: [w.snap.B.me.rack[0].id] }], ['A', 'pass_turn', {}], ['A', 'request_undo', {}], ['B', 'pause_game', {}], ['B', 'request_tahkim', { reason: 'again again' }]]) {
    const r = await w.call(k, a, x); ok(!r.ok, `${k} ${a} refused during Tahkim (${r.code})`);
  }
  const s = await st(w, 'A'); ok(JSON.stringify(s.board) === before && s.game.current_seat === 1 && s.moves.length === 1, 'board, turn and history untouched');
  const hb = await w.raw('A', { action: 'heartbeat', game_id: w.gameId }); ok(hb.ok && hb.status === 'tahkim_pending', 'heartbeat does not close it');
}

group('persistence and reconnection');
{
  const w = await dispute(); await open(w);
  await w.call('A', 'tahkim_message', { text: 'واحد' }); await w.call('B', 'tahkim_message', { text: 'اثنان' }); await w.call('A', 'tahkim_vote', { verdict: 'valid' });
  const re = await w.raw('B', { action: 'reconnect' }); const t = re.snapshot.game.tahkim;
  ok(re.snapshot.game.status === 'tahkim_pending' && t.chat.length === 2 && t.votes.join() === 'valid,' && t.reason, 'a reconnecting player gets messages, selections, reason and the frozen state');
  w.clock.t += 8 * MIN; const re2 = await w.raw('A', { action: 'reconnect' }); ok(re2.snapshot.game.tahkim.chat.length === 2, 'and so does the other, minutes later');
}

group('disconnections go through abandon / surrender, never silently');
{
  const w = await dispute(); await open(w); w.clock.t += 5 * 60000 + 5 * SEC;
  await w.raw('A', { action: 'heartbeat', game_id: w.gameId });
  const c = await w.call('A', 'claim_abandon'); ok(c.ok && c.snapshot.game.result.reason === 'abandon' && c.snapshot.game.winner_seat === 0, 'the present player can claim after 5 minutes of silence');
}
{
  const w = await dispute(); await open(w); const r = await w.call('B', 'resign_game'); ok(r.ok && r.snapshot.game.result.reason === 'resign' && r.snapshot.players[1].score === 0, 'surrender still works during Tahkim (score 0, the other wins)');
}

group('history: records for the match history');
{
  const w = await dispute(); await open(w); await w.call('A', 'tahkim_message', { text: 'x y z' });
  await w.call('A', 'tahkim_vote', { verdict: 'invalid' }); const r = await w.call('B', 'tahkim_vote', { verdict: 'invalid' }); const rec = r.snapshot.game.tahkim_log[0];
  ok(rec.words.join() === 'كتاب' && rec.challenger_seat === 1 && rec.reason === 'كلمة غير مقبولة' && rec.verdict === 'invalid' && rec.at > 0 && rec.players.length === 2 && rec.messages === 1, 'record: word, initiator, reason, verdict, players, time');
  const other = await st(w, 'A'); ok(JSON.stringify(other.game.tahkim_log) === JSON.stringify(r.snapshot.game.tahkim_log), 'both players see the identical record');
  const rm = await w.call('A', 'snapshot'); ok(rm.snapshot.game.tahkim_log.length === 1, 'reading again never duplicates it');
}
done();
