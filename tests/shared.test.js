const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared');

const spec = (mode = 'chat', gender = 'Kadın', age = 25, opts = {}) => ({
  mode, profile: { age, gender },
  filters: { minAge: 18, maxAge: 99, genders: [...D.genders], ...opts }
});
const duo = (gameId = 'valorant', rank = 'Altın', desiredRank = D.any, gender = 'Kadın') => ({
  ...spec('game', gender),
  game: { id: gameId, rank }, gameFilters: { rank: desiredRank }
});

test('her üç modda yalnızca yaş ve cinsiyet profili kullanılır', () => {
  for (const mode of ['chat', 'date', 'game']) {
    const input = mode === 'game' ? duo() : spec(mode);
    // Eskiden bulunan alanlar gönderilse bile sunucunun profiline taşınmaz.
    input.profile.city = 'Ankara'; input.profile.orientation = 'Heteroseksüel';
    input.profile.education = 'Lisans';
    input.filters.city = 'İstanbul';
    const value = D.validate(input);
    assert.deepEqual(value.profile, { age: 25, gender: 'Kadın' });
    assert.deepEqual(Object.keys(value.filters).sort(), ['genders', 'maxAge', 'minAge']);
  }
});
test('18 yaş altı ve 99 yaş üstü beyanları reddedilir', () => {
  assert.equal(D.validate(spec('chat', 'Kadın', 17)), null);
  assert.equal(D.validate(spec('date', 'Erkek', 100)), null);
  assert.ok(D.validate(spec('chat', 'Erkek', 18)));
});
test('geçersiz cinsiyet ve tercih aralıkları reddedilir', () => {
  assert.equal(D.validate(spec('chat', 'Sahte')), null);
  assert.equal(D.validate(spec('date', 'Erkek', 25, { minAge: 30, maxAge: 24 })), null);
  assert.equal(D.validate(spec('chat', 'Erkek', 25, { genders: [] })), null);
  assert.equal(D.validate(spec('chat', 'Erkek', 25, { genders: ['Kadın', 'Kadın'] })), null);
  assert.equal(D.validate(spec('chat', 'Erkek', 25, { genders: ['Robot'] })), null);
  assert.equal(D.validate(spec('abc')), null);
});
test('sohbet, date ve duo ayrı havuzlardır', () => {
  assert.equal(D.compatible(spec('chat'), spec('date')), false);
  assert.equal(D.compatible(spec('chat'), duo()), false);
  assert.equal(D.compatible(spec('date'), duo()), false);
});
test('yaş ve cinsiyet karşılıklı olarak kontrol edilir', () => {
  const a = spec('date', 'Kadın', 22, { minAge: 24, maxAge: 32, genders: ['Erkek'] });
  const b = spec('date', 'Erkek', 28, { minAge: 20, maxAge: 25, genders: ['Kadın'] });
  assert.equal(D.compatible(a, b), true);
  b.filters.genders = ['Erkek'];
  assert.equal(D.compatible(a, b), false);
  b.filters.genders = ['Kadın'];
  b.profile.age = 34;
  assert.equal(D.compatible(a, b), false);
  b.profile.age = 28; a.profile.age = 19;
  assert.equal(D.compatible(a, b), false);
});
test('yönelim ve eğitim artık date eşleşmesini engellemez', () => {
  const a = spec('date', 'Kadın'); a.profile.orientation = 'Heteroseksüel';
  const b = spec('date', 'Kadın'); b.profile.orientation = 'Eşcinsel';
  assert.equal(D.compatible(D.validate(a), D.validate(b)), true);
});
test('DUO için 10 oyun vardır; LoL, VALORANT ve CS2 dahil', () => {
  assert.equal(D.games.length, 10);
  assert.equal(new Set(D.games.map(g => g.id)).size, 10);
  for (const id of ['lol', 'valorant', 'cs2']) assert.ok(D.games.some(g => g.id === id));
});
test('DUO aynı oyun için ve karşılıklı rank tercihleriyle eşleşir', () => {
  assert.equal(D.compatible(duo('valorant', 'Altın'), duo('valorant', 'Demir')), true);
  assert.equal(D.compatible(duo('valorant'), duo('lol')), false);
  assert.equal(D.compatible(duo('valorant', 'Altın', 'Demir'), duo('valorant', 'Demir', 'Altın')), true);
  assert.equal(D.compatible(duo('valorant', 'Altın', 'Demir'), duo('valorant', 'Altın')), false);
  assert.equal(D.compatible(duo('valorant', 'Altın', 'Demir'), duo('valorant', 'Demir', 'Platin')), false);
});
test('oyuna ait olmayan rank ve sahte oyun reddedilir', () => {
  assert.equal(D.validate(duo('wrong')), null);
  assert.equal(D.validate(duo('valorant', 'FACEIT 10')), null);
  assert.equal(D.validate(duo('cs2', 'Derecesiz', 'Radyant')), null);
  assert.equal(D.validate({ ...duo(), gameFilters: null }), null);
  assert.equal(D.validate(duo('minecraft', 'Derece yok', D.any))?.game.rank, 'Derece yok');
});
