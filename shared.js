// İstemci ve sunucu aynı seçeneği/kuralları kullanır.
(function (root, factory) {
  const result = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = result;
  if (root && typeof window !== 'undefined') root.RAST_DATA = result;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const cities = [
    'Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya','Ardahan','Artvin',
    'Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa',
    'Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum',
    'Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkâri','Hatay','Iğdır','Isparta','İstanbul','İzmir',
    'Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kırıkkale','Kırklareli','Kırşehir',
    'Kilis','Kocaeli','Konya','Kütahya','Malatya','Manisa','Mardin','Mersin','Muğla','Muş','Nevşehir',
    'Niğde','Ordu','Osmaniye','Rize','Sakarya','Samsun','Siirt','Sinop','Sivas','Şanlıurfa','Şırnak',
    'Tekirdağ','Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak','Yurt dışı',
    'Belirtmek istemiyorum'
  ];
  const genders = ['Kadın','Erkek','Non-binary','Belirtmek istemiyorum'];
  const orientations = ['Heteroseksüel','Eşcinsel','Biseksüel','Panseksüel','Belirtmek istemiyorum'];
  const educations = ['Lise','Ön lisans','Lisans','Yüksek lisans','Doktora','Diğer','Belirtmek istemiyorum'];
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
  const regions = ['Türkiye','Avrupa','Kuzey Amerika','Orta Doğu','Asya','Diğer'];
  const platforms = ['PC','PlayStation','Xbox','Mobil','Nintendo Switch','Diğer'];
  const microphones = ['Var','Yok'];
  const gameStyles = ['Rahat','Rekabetçi','Her ikisi'];
  const playTimes = ['Şimdi','Gündüz','Akşam','Gece','Hafta sonu','Esnek'];
  const gamingKeys = ['region','platform','microphone','style','time','rank'];
  function validateGame(game, desired) {
    if (!game || !desired || typeof game !== 'object' || typeof desired !== 'object') return null;
    const chosen = games.find(g => g.id === game.id);
    if (!chosen || !chosen.ranks.includes(game.rank) || !regions.includes(game.region) ||
        !platforms.includes(game.platform) || !microphones.includes(game.microphone) ||
        !gameStyles.includes(game.style) || !playTimes.includes(game.time)) return null;
    if (!gamingKeys.every(key => Object.prototype.hasOwnProperty.call(desired, key))) return null;
    if (desired.rank !== any && !chosen.ranks.includes(desired.rank)) return null;
    const options = { region: regions, platform: platforms, microphone: microphones, style: gameStyles, time: playTimes };
    if (Object.keys(options).some(key => desired[key] !== any && !options[key].includes(desired[key]))) return null;
    return {
      game: { id: chosen.id, rank: game.rank, region: game.region, platform: game.platform,
        microphone: game.microphone, style: game.style, time: game.time },
      gameFilters: Object.fromEntries(gamingKeys.map(key => [key, desired[key]]))
    };
  }
  function gameAccepts(a, b) {
    const f = a.gameFilters, p = b.game;
    if (a.game.id !== p.id) return false;
    return (f.rank === any || f.rank === p.rank) &&
      (f.region === any || f.region === p.region) &&
      (f.platform === any || f.platform === p.platform) &&
      (f.microphone === any || f.microphone === p.microphone) &&
      (f.style === any || f.style === p.style || p.style === 'Her ikisi') &&
      (f.time === any || f.time === p.time || p.time === 'Esnek');
  }
  function validate(input) {
    if (!input || typeof input !== 'object') return null;
    const { mode, profile, filters } = input;
    if (!['chat', 'date', 'game'].includes(mode) || !profile || !filters) return null;
    if (!Number.isInteger(profile.age) || profile.age < 18 || profile.age > 99) return null;
    if (!cities.includes(profile.city) || !genders.includes(profile.gender) ||
        !orientations.includes(profile.orientation) || !educations.includes(profile.education)) return null;
    if (filters == null || !Number.isInteger(filters.minAge) || !Number.isInteger(filters.maxAge) ||
        filters.minAge < 18 || filters.maxAge > 99 || filters.maxAge < filters.minAge) return null;
    if (filters.city !== any && !cities.includes(filters.city)) return null;
    if (filters.education !== any && !educations.includes(filters.education)) return null;
    if (filters.orientation !== any && !orientations.includes(filters.orientation)) return null;
    if (!Array.isArray(filters.genders) || !filters.genders.length || filters.genders.length > genders.length ||
        new Set(filters.genders).size !== filters.genders.length || filters.genders.some(g => !genders.includes(g))) return null;
    const gaming = mode === 'game' ? validateGame(input.game, input.gameFilters) : null;
    if (mode === 'game' && !gaming) return null;
    return {
      mode,
      ...(gaming || {}),
      profile: {
        age: profile.age, city: profile.city,
        gender: profile.gender, orientation: profile.orientation, education: profile.education
      },
      filters: {
        minAge: filters.minAge, maxAge: filters.maxAge,
        city: filters.city, education: filters.education,
        orientation: filters.orientation, genders: [...filters.genders]
      }
    };
  }
  function accepts(a, b) {
    const f = a.filters, p = b.profile;
    return p.age >= f.minAge && p.age <= f.maxAge &&
      (f.city === any || f.city === p.city) &&
      (f.education === any || f.education === p.education) &&
      (f.orientation === any || f.orientation === p.orientation) &&
      f.genders.includes(p.gender);
  }
  function orientationAllows(person, other) {
    // Yönelim, tek başına kesin bir tercih beyanı değildir.
    // Yalnızca ikili cinsiyetler arasındaki açık hetero/eşcinsel uyumsuzluğu elenir;
    // diğer tüm durumlarda kişinin seçtiği cinsiyet filtresine öncelik verilir.
    if (!['Kadın', 'Erkek'].includes(person.gender) || !['Kadın', 'Erkek'].includes(other.gender)) return true;
    if (person.orientation === 'Heteroseksüel') return person.gender !== other.gender;
    if (person.orientation === 'Eşcinsel') return person.gender === other.gender;
    return true;
  }
  function compatible(a, b) {
    if (a.mode !== b.mode || !accepts(a, b) || !accepts(b, a)) return false;
    if (a.mode === 'game') return !!a.game && !!b.game && !!a.gameFilters && !!b.gameFilters &&
      gameAccepts(a, b) && gameAccepts(b, a);
    return a.mode !== 'date' || (orientationAllows(a.profile, b.profile) && orientationAllows(b.profile, a.profile));
  }
  return { cities, genders, orientations, educations, reasons, any, games, regions, platforms, microphones, gameStyles, playTimes, validate, accepts, compatible };
});
