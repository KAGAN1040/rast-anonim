// İstemci ve sunucu aynı seçeneği/kuralları kullanır.
(function (root, factory) {
  const result = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = result;
  if (root && typeof window !== 'undefined') root.RAST_DATA = result;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const genders = ['Kadın','Erkek','Non-binary','Belirtmek istemiyorum'];
  const reasons = ['Taciz / hakaret', 'Cinsel taciz / uygunsuz içerik', 'Spam / reklam', 'Reşit olmadığını belirtti', 'Tehdit / dolandırıcılık', 'Diğer'];
  const any = 'Farketmez';
  // Oyun seçimi ve rank listeleri hem tarayıcıda hem sunucuda doğrulanır.
  const games = [
    { id: 'lol', name: 'League of Legends', short: 'LoL', ranks: ['Derecesiz','Demir','Bronz','Gümüş','Altın','Platin','Zümrüt','Elmas','Ustalık','Büyükustalık','Şampiyonluk'] },
    { id: 'valorant', name: 'VALORANT', short: 'VALO', ranks: ['Derecesiz','Demir','Bronz','Gümüş','Altın','Platin','Elmas','Yücelik','Ölümsüzlük','Radyant'] },
    { id: 'cs2', name: 'Counter-Strike 2', short: 'CS2', ranks: ['Derecesiz','Premier 0–4.999','Premier 5.000–9.999','Premier 10.000–14.999','Premier 15.000–19.999','Premier 20.000+','FACEIT 1–3','FACEIT 4–6','FACEIT 7–9','FACEIT 10'] },
    { id: 'fortnite', name: 'Fortnite', short: 'FN', ranks: ['Derecesiz','Bronz','Gümüş','Altın','Platin','Elmas','Elit','Şampiyon','Unreal'] },
    { id: 'pubg', name: 'PUBG: BATTLEGROUNDS', short: 'PUBG', ranks: ['Derecesiz','Bronz','Gümüş','Altın','Platin','Elmas','Usta'] },
    { id: 'minecraft', name: 'Minecraft', short: 'MC', ranks: ['Derece yok'] },
    { id: 'roblox', name: 'Roblox', short: 'RBX', ranks: ['Derece yok'] },
    { id: 'apex', name: 'Apex Legends', short: 'APEX', ranks: ['Derecesiz','Çaylak','Bronz','Gümüş','Altın','Platin','Elmas','Usta','Predator'] },
    { id: 'rocketleague', name: 'Rocket League', short: 'RL', ranks: ['Derecesiz','Bronz','Gümüş','Altın','Platin','Elmas','Şampiyon','Büyük Şampiyon','Supersonic Legend'] },
    { id: 'r6', name: 'Rainbow Six Siege', short: 'R6', ranks: ['Derecesiz','Bakır','Bronz','Gümüş','Altın','Platin','Zümrüt','Elmas','Şampiyon'] }
  ];
  // Yaş ve cinsiyet tüm modlarda aynı biçimde çalışır.
  // Duo modunda bunlara yalnızca oyun ve rank eklenir.
  function validateGame(game, desired) {
    if (!game || typeof game !== 'object' || !desired || typeof desired !== 'object') return null;
    const chosen = games.find(g => g.id === game.id);
    if (!chosen || !chosen.ranks.includes(game.rank)) return null;
    if (desired.rank !== any && !chosen.ranks.includes(desired.rank)) return null;
    return { game: { id: chosen.id, rank: game.rank }, gameFilters: { rank: desired.rank } };
  }
  function validate(input) {
    if (!input || typeof input !== 'object') return null;
    const { mode, profile, filters } = input;
    if (!['chat', 'date', 'game'].includes(mode) || !profile || !filters) return null;
    if (!Number.isInteger(profile.age) || profile.age < 18 || profile.age > 99 || !genders.includes(profile.gender)) return null;
    if (!Number.isInteger(filters.minAge) || !Number.isInteger(filters.maxAge) ||
        filters.minAge < 18 || filters.maxAge > 99 || filters.minAge > filters.maxAge) return null;
    if (!Array.isArray(filters.genders) || !filters.genders.length || filters.genders.length > genders.length ||
        new Set(filters.genders).size !== filters.genders.length || filters.genders.some(g => !genders.includes(g))) return null;
    const gaming = mode === 'game' ? validateGame(input.game, input.gameFilters) : null;
    if (mode === 'game' && !gaming) return null;
    return {
      mode, ...(gaming || {}),
      profile: { age: profile.age, gender: profile.gender },
      filters: { minAge: filters.minAge, maxAge: filters.maxAge, genders: [...filters.genders] }
    };
  }
  function accepts(a, b) {
    const f = a.filters, p = b.profile;
    return p.age >= f.minAge && p.age <= f.maxAge && f.genders.includes(p.gender);
  }
  function compatible(a, b) {
    if (a.mode !== b.mode || !accepts(a, b) || !accepts(b, a)) return false;
    if (a.mode === 'game') return !!a.game && !!b.game && !!a.gameFilters && !!b.gameFilters &&
      a.game.id === b.game.id &&
      (a.gameFilters.rank === any || a.gameFilters.rank === b.game.rank) &&
      (b.gameFilters.rank === any || b.gameFilters.rank === a.game.rank);
    return true;
  }
  return { genders, reasons, any, games, validate, accepts, compatible };
});
