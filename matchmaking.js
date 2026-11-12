'use strict';
// Progressive matching: every participant must reach a tier independently.
// Mode and game remain mandatory even at the broadest tier.
const DATA = require('./shared');
const STAGES = Object.freeze([
  { afterMs: 0,      maxAgeDrift: 0,        maxRankDrift: 0,        genderMisses: 0, message: 'Önce filtrelerine tam uyan biri aranıyor.' },
  { afterMs: 15000,  maxAgeDrift: 3,        maxRankDrift: 1,        genderMisses: 0, message: 'Aramayı biraz genişlettik: yakın yaşlar ve ranklar da değerlendiriliyor.' },
  { afterMs: 30000,  maxAgeDrift: 7,        maxRankDrift: 3,        genderMisses: 0, message: 'En yakın kişiyi bulmak için yaş ve rank aralığı genişletildi.' },
  { afterMs: 50000,  maxAgeDrift: 15,       maxRankDrift: Infinity, genderMisses: 1, message: 'Arama genişletildi. Tercihlerine tam uymayan biri bulunursa sana bildireceğiz.' },
  { afterMs: 75000,  maxAgeDrift: Infinity, maxRankDrift: Infinity, genderMisses: 2, message: 'Aynı moddaki diğer çevrimiçi kişiler de değerlendiriliyor.' }
]);
function stageFor(waitMs) {
  for (let i = STAGES.length - 1; i >= 0; i--) if (waitMs >= STAGES[i].afterMs) return i;
  return 0;
}
function ageDrift(filters, age) {
  return Math.max(0, filters.minAge - age, age - filters.maxAge);
}
function rankDrift(state, other) {
  if (state.mode !== 'game' || state.gameFilters.rank === DATA.any) return 0;
  const game = DATA.games.find(g => g.id === state.game.id);
  if (!game) return Infinity;
  const index = game.ranks.indexOf(state.gameFilters.rank);
  const otherIndex = game.ranks.indexOf(other.game.rank);
  return index < 0 || otherIndex < 0 ? Infinity : Math.abs(index - otherIndex);
}
function fit(state, other) {
  const age = ageDrift(state.filters, other.profile.age);
  const gender = !state.filters.genders.includes(other.profile.gender);
  const rank = state.mode === 'game' ? rankDrift(state, other) : 0;
  const reasons = [];
  if (age) reasons.push('Yaş aralığın dışında');
  if (gender) reasons.push('Cinsiyet tercihin dışında');
  if (rank) reasons.push('Tercih ettiğin ranktan farklı');
  return { exact: !reasons.length, reasons, ageDrift: age, genderMiss: Number(gender), rankDrift: rank };
}
function assess(a, b) {
  if (a.mode !== b.mode) return null;
  if (a.mode === 'game' && (!a.game || !b.game || a.game.id !== b.game.id)) return null;
  const aFit = fit(a, b), bFit = fit(b, a);
  const maxAgeDrift = Math.max(aFit.ageDrift, bFit.ageDrift);
  const maxRankDrift = Math.max(aFit.rankDrift, bFit.rankDrift);
  const genderMisses = aFit.genderMiss + bFit.genderMiss;
  const requiredStage = STAGES.findIndex(s => maxAgeDrift <= s.maxAgeDrift &&
    maxRankDrift <= s.maxRankDrift && genderMisses <= s.genderMisses);
  const score = (aFit.ageDrift + bFit.ageDrift) * 3 +
    (aFit.rankDrift + bFit.rankDrift) * 6 + genderMisses * 45;
  return { requiredStage, score, aFit: { exact: aFit.exact, reasons: aFit.reasons }, bFit: { exact: bFit.exact, reasons: bFit.reasons } };
}
module.exports = { STAGES, stageFor, assess };
