const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const D = require('../shared');

// Ağdan paket indirmeyen CI ortamlarında sunucunun eşleşme akışını olay tabanlı
// olarak sınamak için Express / Socket.IO taşıyıcısının küçük taklitleri.
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
  connect(id) { const socket = new FakeSocket(id); this.sockets.sockets.set(id, socket); this.handlers.get('connection')(socket); return socket; }
}
const io = new FakeIO();
function fakeExpress() {
  const app = (_req, _res) => {};
  for (const fn of ['disable', 'set', 'use', 'get', 'post']) app[fn] = () => app;
  return app;
}
fakeExpress.json = () => (_req,_res,next) => next?.();
fakeExpress.static = () => (_req,_res,next) => next?.();
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'express') return fakeExpress;
  if (request === 'compression' || request === 'helmet' || request === 'express-rate-limit') return () => (_req,_res,next) => next?.();
  if (request === 'socket.io') return { Server: class { constructor() { return io; } } };
  if (request === 'pg') return { Pool: class {} };
  return originalLoad.apply(this, arguments);
};
const server = require('../server');
Module._load = originalLoad;

function spec(mode, gender, orientation, prefer, age = 25) {
  return {
    acceptedRules: true, mode,
    profile: { age, city: 'Ankara', gender, orientation, education: 'Lisans' },
    filters: { minAge: 18, maxAge: 99, city: D.any, education: D.any, orientation: D.any, genders: prefer }
  };
}
function ask(socket, event, value) {
  let result;
  socket.trigger(event, value, data => { result = data; });
  return result;
}

test('iki gerçek zamanlı oturum eşleşir, mesajı iletir ve raporla ayrılır', () => {
  const a = io.connect('user-a');
  const b = io.connect('user-b');
  const alice = spec('date', 'Kadın', 'Heteroseksüel', ['Erkek']);
  const bob = spec('date', 'Erkek', 'Heteroseksüel', ['Kadın']);
  assert.equal(ask(a, 'match:start', alice).ok, true);
  assert.equal(server.waiting.date.size, 1);
  assert.equal(ask(b, 'match:start', bob).ok, true);
  assert.equal(server.waiting.date.size, 0);
  assert.equal(a.seen('match:found').length, 1);
  assert.equal(b.seen('match:found').length, 1);
  assert.equal(ask(a, 'chat:send', { text: 'Merhaba 👋' }).ok, true);
  assert.equal(b.seen('chat:message')[0].payload.text, 'Merhaba 👋');
  const result = ask(b, 'user:report', { reason: 'Spam / reklam', detail: 'Test bildirimi.' });
  assert.equal(result.ok, true);
  assert.ok(result.reportId);
  assert.equal(a.seen('match:ended').length, 1);
  assert.equal(server.clients.get('user-a').status, 'idle');
});

test('sohbet ve date ayrı havuzlardır; filtre uyuşmuyorsa eşleşmez', () => {
  const c = io.connect('user-c');
  const d = io.connect('user-d');
  assert.equal(ask(c, 'match:start', spec('chat', 'Kadın', 'Heteroseksüel', ['Erkek'])).ok, true);
  assert.equal(ask(d, 'match:start', spec('date', 'Erkek', 'Heteroseksüel', ['Kadın'])).ok, true);
  assert.equal(c.seen('match:found').length, 0);
  assert.equal(d.seen('match:found').length, 0);
  assert.equal(server.waiting.chat.size, 1);
  assert.equal(server.waiting.date.size, 1);
  ask(c, 'match:cancel', {});
  assert.equal(server.waiting.chat.size, 0);
});

test('çocuk beyanı reddedilir', () => {
  const e = io.connect('user-e');
  assert.equal(ask(e, 'match:start', spec('chat', 'Erkek', 'Biseksüel', D.genders, 16)).ok, false);
});

function gameSpec(mode = 'game', id = 'cs2', rank = 'Derecesiz') {
  return {
    ...spec('chat', 'Erkek', 'Biseksüel', D.genders), mode,
    game: { id, rank, region: 'Avrupa', platform: 'PC', microphone: 'Var', style: 'Rahat', time: 'Gece' },
    gameFilters: { rank: D.any, region: 'Avrupa', platform: 'PC', microphone: 'Var', style: 'Rahat', time: 'Gece' }
  };
}

test('DUO havuzu ayrı; aynı oyun ve filtrelerde iki kişi eşleşir, rank sohbet kartına taşınır', () => {
  const a = io.connect('gamer-a'), b = io.connect('gamer-b'), c = io.connect('gamer-c');
  assert.equal(ask(a, 'match:start', gameSpec('game', 'cs2')).ok, true);
  assert.equal(ask(c, 'match:start', gameSpec('game', 'valorant')).ok, true);
  assert.equal(a.seen('match:found').length, 0);
  assert.equal(ask(b, 'match:start', gameSpec('game', 'cs2', 'FACEIT 10')).ok, true);
  assert.equal(a.seen('match:found').length, 1);
  assert.equal(b.seen('match:found').length, 1);
  assert.equal(a.seen('match:found')[0].payload.game.rank, 'FACEIT 10');
  assert.equal(a.seen('match:found')[0].payload.mode, 'game');
  assert.equal(server.waiting.game.has('gamer-c'), true);
  assert.equal(ask(b, 'chat:send', {text:'Birlikte girelim mi?'}).ok, true);
  assert.equal(a.seen('chat:message').at(-1).payload.text, 'Birlikte girelim mi?');
  ask(b, 'match:cancel', {});
  ask(c, 'match:cancel', {});
});

test('DUO için platform, mikrofon ve rank kısıtı sunucuda da uygulanır', () => {
  const a = io.connect('game-filter-a'), b = io.connect('game-filter-b');
  const pref = gameSpec('game', 'valorant', 'Demir');
  pref.gameFilters.rank = 'Altın';
  assert.equal(ask(a, 'match:start', pref).ok, true);
  assert.equal(ask(b, 'match:start', gameSpec('game', 'valorant', 'Demir')).ok, true);
  assert.equal(a.seen('match:found').length, 0);
  assert.equal(b.seen('match:found').length, 0);
  ask(a, 'match:cancel', {}); ask(b, 'match:cancel', {});
});
