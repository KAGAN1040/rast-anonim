const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared');
const profile = (gender, age = 25, city = 'Ankara') => ({ age, city, gender, orientation: 'Biseksüel', education: 'Lisans' });
const filters = (overrides = {}) => ({ minAge:18, maxAge:35, city:D.any, education:D.any, orientation:D.any, genders:[...D.genders], ...overrides });
const spec = (mode, gender, f = {}, age = 25, city = 'Ankara') => ({ mode, profile: profile(gender, age, city), filters: filters(f) });

test('18 yaş altı, sahte bilgi ve geçersiz aralık kabul edilmez', () => {
  assert.equal(D.validate(spec('chat', 'Kadın', {}, 17)), null);
  assert.equal(D.validate(spec('chat', 'Erkek', { minAge: 27, maxAge: 22 })), null);
  assert.equal(D.validate(spec('chat', 'Sahte')), null);
  assert.equal(D.validate(spec('unknown', 'Kadın')), null);
});
test('83 şehir, cinsiyet ve yönelim listesi işlevsel', () => {
  assert.ok(D.cities.includes('İstanbul'));
  assert.ok(D.cities.includes('Yurt dışı'));
  assert.ok(D.genders.includes('Non-binary'));
  assert.ok(D.orientations.includes('Panseksüel'));
});
test('Sohbet ile date havuzları karışmaz', () => {
  assert.equal(D.compatible(spec('chat', 'Kadın'), spec('date', 'Erkek')), false);
});
test('Eşleşme her iki kişinin tercihlerini sağlamalıdır', () => {
  const a = spec('date', 'Kadın', { genders: ['Erkek'], minAge: 23, maxAge: 33 });
  const b = spec('date', 'Erkek', { genders: ['Kadın'], minAge: 21, maxAge: 28 });
  const c = spec('date', 'Erkek', { genders: ['Erkek'] });
  assert.equal(D.compatible(a, b), true);
  assert.equal(D.compatible(a, c), false);
});
test('Yaş, şehir, eğitim, yönelim filtreleri çalışır', () => {
  const a = spec('date', 'Kadın', { city: 'Ankara', education: 'Lisans', orientation: 'Biseksüel', minAge: 24, maxAge: 31 });
  assert.equal(D.compatible(a, spec('date', 'Erkek', {}, 24, 'İstanbul')), false);
  assert.equal(D.compatible(a, spec('date', 'Erkek', {}, 34, 'Ankara')), false);
  assert.equal(D.compatible(a, spec('date', 'Erkek', {}, 29, 'Ankara')), true);
});
test('Boş ve tekrar cinsiyet tercihi reddedilir', () => {
  assert.equal(D.validate(spec('chat', 'Erkek', { genders:[] })), null);
  assert.equal(D.validate(spec('chat', 'Erkek', { genders:['Kadın','Kadın'] })), null);
});

test('Date için açık hetero / eşcinsel uyumsuzluğu elenir', () => {
  const a = spec('date', 'Kadın'); a.profile.orientation = 'Heteroseksüel';
  const b = spec('date', 'Kadın'); b.profile.orientation = 'Biseksüel';
  const c = spec('date', 'Erkek'); c.profile.orientation = 'Heteroseksüel';
  assert.equal(D.compatible(a, b), false);
  assert.equal(D.compatible(a, c), true);
  b.profile.orientation = 'Eşcinsel'; a.profile.orientation = 'Eşcinsel';
  assert.equal(D.compatible(a, b), true);
});

const gameSpec = (gameId = 'valorant', overrides = {}, search = {}) => {
  const rank = D.games.find(g => g.id === gameId)?.ranks[0] || 'Derecesiz';
  return {
    ...spec('game', 'Erkek'),
    game: { id: gameId, rank, region: 'Türkiye', platform: 'PC', microphone: 'Var', style: 'Rekabetçi', time: 'Akşam', ...overrides },
    gameFilters: { rank: D.any, region: D.any, platform: D.any, microphone: D.any, style: D.any, time: D.any, ...search }
  };
};

test('DUO havuzunda tam 10 oyun bulunur; LoL, VALORANT, CS2 dahil', () => {
  assert.equal(D.games.length, 10);
  assert.equal(new Set(D.games.map(g => g.id)).size, 10);
  for (const id of ['lol', 'valorant', 'cs2']) assert.ok(D.games.some(g => g.id === id));
  assert.equal(D.validate(gameSpec('valorant'))?.mode, 'game');
});
test('rank havuzları oyuna göre doğrulanır; sahte oyun ve hileli filtreler reddedilir', () => {
  assert.equal(D.validate(gameSpec('hacked')), null);
  assert.equal(D.validate(gameSpec('valorant', {rank: 'FACEIT 10'})), null);
  assert.equal(D.validate(gameSpec('cs2', {}, {rank: 'Radyant'})), null);
  assert.equal(D.validate(gameSpec('lol', {platform: 'PlayBox'})), null);
  assert.equal(D.validate(gameSpec('lol', {}, {microphone: 'İstediğim gibi'})), null);
  assert.equal(D.validate({ ...gameSpec('valorant'), gameFilters: null }), null);
});
test('DUO yalnızca aynı oyunda ve iki tarafın kabul ettiği filtrelerle eşleştirir', () => {
  const a = gameSpec('valorant');
  const b = gameSpec('valorant');
  assert.equal(D.compatible(a, b), true);
  assert.equal(D.compatible(a, gameSpec('lol')), false);
  assert.equal(D.compatible(a, spec('chat', 'Erkek')), false);
  assert.equal(D.compatible(a, spec('date', 'Erkek')), false);
  const tests = [
    { profile: { rank: 'Altın' }, filter: { rank: 'Demir' } },
    { profile: {region:'Kuzey Amerika'}, filter: {region: 'Türkiye'} },
    { profile: {platform:'Xbox'}, filter: {platform: 'PC'} },
    { profile: {microphone:'Yok'}, filter: {microphone: 'Var'} },
    { profile: {style:'Rahat'}, filter: {style: 'Rekabetçi'} },
    { profile: {time:'Gece'}, filter: {time: 'Akşam'} }
  ];
  for (const case_ of tests) {
    const other = gameSpec('valorant', case_.profile);
    const picky = gameSpec('valorant', {}, case_.filter);
    assert.equal(D.compatible(picky, other), false, `Esnek olmayan filtre: ${JSON.stringify(case_)}`);
    assert.equal(D.compatible(other, picky), false, 'Eşleşme simetrik olmalı');
  }
  assert.equal(D.compatible(gameSpec('valorant', {style:'Her ikisi', time: 'Esnek'}), gameSpec('valorant', {}, {style: 'Rahat',time:'Gündüz'})), true);
});
