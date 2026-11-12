const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const D = require('../shared');

// Node üzerinde gerçek paket indirmeden Socket.IO akış testi.
class FakeSocket {
  constructor(id) { this.id = id; this.handshake = { address: '127.0.0.1' }; this.handlers = new Map(); this.outbox = []; }
  on(event, cb) { this.handlers.set(event, cb); }
  emit(event, payload) { this.outbox.push({ event, payload }); }
  trigger(event, ...args) { this.handlers.get(event)?.(...args); }
  seen(event) { return this.outbox.filter(x => x.event === event); }
}
class FakeIO {
  constructor() { this.handlers = new Map(); this.sockets = { sockets: new Map() }; this.sent = []; }
  on(event, cb) { this.handlers.set(event, cb); }
  to(id) { return { emit: (event, payload) => this.sockets.sockets.get(id)?.emit(event, payload) }; }
  emit(event, payload) { this.sent.push({ event, payload }); }
  connect(id) { const s = new FakeSocket(id); this.sockets.sockets.set(id, s); this.handlers.get('connection')(s); return s; }
}
const io = new FakeIO();
function fakeExpress() {
  const app = (_req, _res) => {};
  for (const fn of ['disable', 'set', 'use', 'get', 'post']) app[fn] = () => app;
  return app;
}
fakeExpress.json = () => (_req, _res, next) => next?.();
fakeExpress.static = () => (_req, _res, next) => next?.();
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'express') return fakeExpress;
  if (request === 'compression' || request === 'helmet' || request === 'express-rate-limit') return () => (_req, _res, next) => next?.();
  if (request === 'socket.io') return { Server: class { constructor() { return io; } } };
  if (request === 'pg') return { Pool: class {} };
  return originalLoad.apply(this, arguments);
};
const server = require('../server');
Module._load = originalLoad;
const spec = (mode, gender, prefers, age = 25, filters = {}) => ({
  acceptedRules: true, mode,
  profile: { age, gender },
  filters: { minAge: 18, maxAge: 99, genders: prefers, ...filters }
});
const gameSpec = (id = 'cs2', rank = 'Derecesiz', preferredRank = D.any, gender = 'Erkek') => ({
  ...spec('game', gender, [...D.genders]),
  game: { id, rank }, gameFilters: { rank: preferredRank }
});
function ask(socket, event, value) {
  let result;
  socket.trigger(event, value, data => { result = data; });
  return result;
}
test('date iki tarafın yaş/cinsiyet filtresini sağlayınca eşleşir, mesaj ve şikâyet işler', () => {
  const a = io.connect('user-a'), b = io.connect('user-b');
  const alice = spec('date', 'Kadın', ['Erkek'], 24, { minAge: 22, maxAge: 29 });
  const bob = spec('date', 'Erkek', ['Kadın'], 26, { minAge: 18, maxAge: 25 });
  assert.equal(ask(a, 'match:start', alice).ok, true);
  assert.equal(server.waiting.date.size, 1);
  assert.equal(ask(b, 'match:start', bob).ok, true);
  assert.equal(a.seen('match:found').length, 1);
  assert.equal(b.seen('match:found').length, 1);
  assert.deepEqual(a.seen('match:found')[0].payload.profile, { age: 26, gender: 'Erkek' });
  assert.equal(ask(a, 'chat:send', { text: 'Merhaba 👋' }).ok, true);
  assert.equal(b.seen('chat:message')[0].payload.text, 'Merhaba 👋');
  const result = ask(b, 'user:report', { reason: 'Spam / reklam', detail: 'Test bildirimi.' });
  assert.equal(result.ok, true);
  assert.ok(result.reportId);
  assert.equal(a.seen('match:ended').length, 1);
});
test('sohbet, date ve oyun havuzları ayrı kalır', () => {
  const c = io.connect('user-c'), d = io.connect('user-d');
  assert.equal(ask(c, 'match:start', spec('chat', 'Kadın', ['Erkek'])).ok, true);
  assert.equal(ask(d, 'match:start', spec('date', 'Erkek', ['Kadın'])).ok, true);
  assert.equal(c.seen('match:found').length, 0);
  assert.equal(d.seen('match:found').length, 0);
  ask(c, 'match:cancel', {}); ask(d, 'match:cancel', {});
});
test('sunucu 18 yaş altını ve eksik bilgiyi reddeder', () => {
  const c = io.connect('user-e');
  assert.equal(ask(c, 'match:start', spec('chat', 'Erkek', D.genders, 16)).ok, false);
  const invalid = spec('chat', 'Erkek', D.genders); invalid.acceptedRules = false;
  assert.equal(ask(c, 'match:start', invalid).ok, false);
});
test('DUO sadece aynı oyunda, uyumlu rank ve karşılıklı cinsiyet/yaş tercihinde eşleşir', () => {
  const a = io.connect('gamer-a'), b = io.connect('gamer-b'), c = io.connect('gamer-c');
  assert.equal(ask(a, 'match:start', gameSpec('cs2', 'Derecesiz', 'FACEIT 10')).ok, true);
  assert.equal(ask(c, 'match:start', gameSpec('valorant', 'Altın')).ok, true);
  assert.equal(a.seen('match:found').length, 0);
  assert.equal(ask(b, 'match:start', gameSpec('cs2', 'FACEIT 10')).ok, true);
  assert.equal(a.seen('match:found').length, 1);
  assert.equal(a.seen('match:found')[0].payload.game.rank, 'FACEIT 10');
  assert.equal(a.seen('match:found')[0].payload.game.platform, undefined);
  assert.equal(server.waiting.game.has('gamer-c'), true);
  ask(a, 'match:cancel', {}); ask(c, 'match:cancel', {});
});
test('DUO uyumsuz rank tercihini eşleştirmez', () => {
  const a = io.connect('gamer-rank-a'), b = io.connect('gamer-rank-b');
  assert.equal(ask(a, 'match:start', gameSpec('valorant', 'Altın', 'Demir')).ok, true);
  assert.equal(ask(b, 'match:start', gameSpec('valorant', 'Altın')).ok, true);
  assert.equal(a.seen('match:found').length, 0);
  ask(a, 'match:cancel', {}); ask(b, 'match:cancel', {});
});


test('kaybolan match:found olayı match:status ile kurtarılır', () => {
  const a = io.connect('recovery-a'), b = io.connect('recovery-b');
  assert.equal(ask(a, 'match:start', spec('chat', 'Kadın', D.genders)).ok, true);
  assert.equal(ask(a, 'match:status', {}).status, 'searching');
  assert.equal(ask(b, 'match:start', spec('chat', 'Erkek', D.genders)).ok, true);
  const recovered = ask(a, 'match:status', {});
  assert.equal(recovered.status, 'chatting');
  assert.equal(recovered.peer.alias, server.clients.get('recovery-b').alias);
  ask(a, 'match:cancel', {});
  assert.equal(ask(a, 'match:status', {}).status, 'idle');
});

test('same-origin ve proxy host izinli, başka origin yasak', () => {
  const allow = server.isAllowedSocketOrigin;
  assert.equal(allow({headers:{origin:'https://rast.example',host:'rast.example'}}), true);
  assert.equal(allow({headers:{origin:'https://rast.example',host:'internal:10000','x-forwarded-host':'rast.example'}}), true);
  assert.equal(allow({headers:{origin:'https://evil.example',host:'rast.example'}}), false);
  assert.equal(allow({headers:{origin:'null',host:'rast.example'}}), false);
});
