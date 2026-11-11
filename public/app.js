(() => {
  'use strict';
  const D = window.RAST_DATA;
  const socket = io({ reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 4500, timeout: 9000 });
  const $ = id => document.getElementById(id);
  const pages = ['landing', 'setup', 'search', 'chat', 'ended'];
  const state = { mode: 'chat', view: 'landing', spec: null, peer: null, preferred: new Set(D.genders), preferredTouched: false, selectedGame: null, searchingSince: 0, typingTimeout: null, searchTimeout: null, toastTimeout: null, lastTyping: 0 };

  function showView(view) {
    state.view = view;
    pages.forEach(id => {
      const el = $(id); const current = id === view;
      el.hidden = !current; el.classList.toggle('active', current);
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (view === 'chat') setTimeout(() => $('messageInput').focus({ preventScroll: true }), 180);
    if (view !== 'search') clearTimeout(state.searchTimeout);
  }
  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => el.classList.remove('show'), 3400);
  }
  function setOptions(id, choices) {
    for (const choice of choices) {
      const option = document.createElement('option'); option.value = choice; option.textContent = choice;
      $(id).append(option);
    }
  }
  setOptions('myCity', D.cities); setOptions('filterCity', D.cities);
  setOptions('myGender', D.genders); setOptions('myOrientation', D.orientations);
  setOptions('myEducation', D.educations); setOptions('filterEducation', D.educations);
  setOptions('filterOrientation', D.orientations); setOptions('reportReason', D.reasons);
  setOptions('myGameRegion', D.regions); setOptions('filterGameRegion', D.regions);
  setOptions('myPlatform', D.platforms); setOptions('filterPlatform', D.platforms);
  setOptions('myMic', D.microphones); setOptions('filterMic', D.microphones);
  setOptions('myStyle', D.gameStyles); setOptions('filterStyle', D.gameStyles.filter(v => v !== 'Her ikisi'));
  setOptions('myPlayTime', D.playTimes); setOptions('filterPlayTime', D.playTimes.filter(v => v !== 'Esnek'));
  $('myGameRegion').value = 'Türkiye'; $('myPlatform').value = 'PC';
  $('myMic').value = 'Var'; $('myStyle').value = 'Rahat'; $('myPlayTime').value = 'Şimdi';
  $('year').textContent = new Date().getFullYear();

  function gameName(id) { return D.games.find(g => g.id === id)?.name || id; }
  function modeName(mode) { return mode === 'date' ? 'Date' : mode === 'game' ? 'Duo' : 'Sohbet'; }
  function chooseGame(gameId) {
    const game = D.games.find(item => item.id === gameId);
    if (!game) return;
    state.selectedGame = game.id;
    $('myGameRank').replaceChildren(); $('filterGameRank').replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Rank seç';
    $('myGameRank').append(placeholder);
    const anyOption = document.createElement('option'); anyOption.value = D.any; anyOption.textContent = D.any;
    $('filterGameRank').append(anyOption);
    setOptions('myGameRank', game.ranks); setOptions('filterGameRank', game.ranks);
    $('myGameRank').value = '';
    $('filterGameRank').value = D.any;
    renderGamePicker();
  }
  function renderGamePicker() {
    const wrap = $('gamePicker'); wrap.replaceChildren();
    D.games.forEach(game => {
      const btn = document.createElement('button'); btn.type = 'button';
      const selected = state.selectedGame === game.id;
      btn.className = 'game-tile' + (selected ? ' chosen' : '');
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
      btn.dataset.game = game.id;
      const monogram = document.createElement('span'); monogram.className = 'game-symbol'; monogram.textContent = game.short;
      const name = document.createElement('span'); name.className = 'game-title'; name.textContent = game.name;
      const check = document.createElement('span'); check.className = 'game-check'; check.textContent = selected ? '✓' : '+';
      btn.append(monogram, name, check);
      btn.addEventListener('click', () => chooseGame(game.id)); wrap.append(btn);
    });
  }
  renderGamePicker();

  function renderChips() {
    const wrap = $('genderChips'); wrap.replaceChildren();
    D.genders.forEach(gender => {
      const btn = document.createElement('button'); btn.type = 'button';
      btn.className = `choice-chip${state.preferred.has(gender) ? ' selected' : ''}`;
      btn.setAttribute('aria-pressed', state.preferred.has(gender) ? 'true' : 'false');
      btn.textContent = gender;
      btn.addEventListener('click', () => {
        if (state.preferred.has(gender) && state.preferred.size === 1) { toast('En az bir cinsiyet seçmelisin.'); return; }
        state.preferredTouched = true;
        state.preferred.has(gender) ? state.preferred.delete(gender) : state.preferred.add(gender);
        renderChips();
      });
      wrap.append(btn);
    });
  }
  renderChips();
  function suggestGenders() {
    if (state.mode !== 'date' || state.preferredTouched) return;
    const gender = $('myGender').value, orientation = $('myOrientation').value;
    if (!['Kadın', 'Erkek'].includes(gender)) return;
    if (orientation === 'Heteroseksüel') state.preferred = new Set([gender === 'Kadın' ? 'Erkek' : 'Kadın']);
    else if (orientation === 'Eşcinsel') state.preferred = new Set([gender]);
    else if (orientation === 'Biseksüel' || orientation === 'Panseksüel') state.preferred = new Set(D.genders);
    renderChips();
  }
  $('myGender').addEventListener('change', suggestGenders);
  $('myOrientation').addEventListener('change', suggestGenders);

  function openMode(mode) {
    state.mode = mode;
    state.preferred = new Set(D.genders); state.preferredTouched = false; renderChips(); suggestGenders();
    const gameMode = mode === 'game';
    $('orientationHelp').hidden = mode !== 'date';
    $('orientationProfileField').hidden = gameMode;
    $('orientationFilterField').hidden = gameMode;
    $('genderPreferenceField').hidden = gameMode;
    $('gamingSection').hidden = !gameMode;
    document.querySelector('.form-step').innerHTML = gameMode ? '01 <span>/ 03</span>' : '01 <span>/ 02</span>';
    $('myOrientation').required = !gameMode;
    $('formModeLabel').textContent = mode === 'chat' ? 'SOHBET MODU' : mode === 'date' ? 'DATE MODU' : 'DUO MODU';
    $('setupTitle').innerHTML = mode === 'chat' ? 'Önce biraz<br><em>tanışalım.</em>' : mode === 'date' ? 'Belki de bir<br><em>kıvılcım.</em>' : 'Takım arkadaşı<br><em>bulalım.</em>';
    $('startSearchBtn').querySelector('span').textContent = mode === 'chat' ? 'Sohbet arkadaşı bul' : mode === 'date' ? 'Date eşleşmesi bul' : 'Oyun arkadaşı bul';
    $('formError').hidden = true;
    showView('setup');
  }
  $('chooseChat').addEventListener('click', () => openMode('chat'));
  $('chooseDate').addEventListener('click', () => openMode('date'));
  $('chooseGame').addEventListener('click', () => openMode('game'));
  $('backHome').addEventListener('click', () => showView('landing'));
  $('logoLink').addEventListener('click', e => {
    e.preventDefault();
    if (state.view === 'chat' && !window.confirm('Mevcut sohbetten ayrılmak istiyor musun?')) return;
    if (state.view === 'chat' || state.view === 'search') socket.emit('match:cancel', {});
    showView('landing');
  });

  const rules = $('rulesDialog'), report = $('reportDialog');
  for (const button of [$('howBtn'), $('footerRules'), $('inlineRules')]) {
    button.addEventListener('click', e => { e.preventDefault(); rules.showModal(); });
  }
  document.querySelectorAll('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => $(btn.dataset.closeDialog).close()));
  for (const dialog of [rules, report]) {
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  }

  function extractSpec() {
    return {
      mode: state.mode,
      acceptedRules: $('ageConsent').checked,
      profile: {
        age: Number($('myAge').value), city: $('myCity').value, education: $('myEducation').value,
        gender: $('myGender').value,
        orientation: state.mode === 'game' ? 'Belirtmek istemiyorum' : $('myOrientation').value
      },
      filters: {
        minAge: Number($('minAge').value), maxAge: Number($('maxAge').value),
        city: $('filterCity').value, education: $('filterEducation').value,
        orientation: state.mode === 'game' ? D.any : $('filterOrientation').value,
        genders: state.mode === 'game' ? [...D.genders] : D.genders.filter(g => state.preferred.has(g))
      },
      ...(state.mode === 'game' ? {
        game: {
          id: state.selectedGame, rank: $('myGameRank').value,
          region: $('myGameRegion').value, platform: $('myPlatform').value,
          microphone: $('myMic').value, style: $('myStyle').value, time: $('myPlayTime').value
        },
        gameFilters: {
          rank: $('filterGameRank').value, region: $('filterGameRegion').value,
          platform: $('filterPlatform').value, microphone: $('filterMic').value,
          style: $('filterStyle').value, time: $('filterPlayTime').value
        }
      } : {})
    };
  }
  function sendSearch() {
    if (!socket.connected) { $('searchDescription').textContent = 'Sunucuya bağlanılıyor...'; return; }
    if (!state.spec) return;
    socket.timeout(8000).emit('match:start', state.spec, (err, result) => {
      if (state.view !== 'search') return;
      if (err) { $('searchDescription').textContent = 'Bağlantı yanıt vermiyor. Yeniden deneniyor...'; return; }
      if (!result?.ok) { toast(result?.error || 'Eşleşme başlatılamadı.'); showView('setup'); }
    });
  }
  function fillSearchSummary() {
    const { filters, mode } = state.spec;
    $('searchSummary').replaceChildren();
    const parts = [mode === 'game' ? '🎮 Duo · ' + gameName(state.spec.game.id) : mode === 'chat' ? '💬 Sohbet' : '♥ Date', `${filters.minAge}–${filters.maxAge} yaş`];
    if (mode === 'game') {
      parts.push('Rank: ' + state.spec.game.rank);
      parts.push(state.spec.game.region);
      if (state.spec.gameFilters.rank !== D.any) parts.push('Aranan rank: ' + state.spec.gameFilters.rank);
      if (state.spec.gameFilters.microphone !== D.any) parts.push('Mikrofon: ' + state.spec.gameFilters.microphone);
    }
    if (filters.city !== D.any) parts.push(filters.city);
    if (filters.education !== D.any) parts.push(filters.education);
    if (mode !== 'game' && filters.orientation !== D.any) parts.push(filters.orientation);
    if (mode !== 'game' && filters.genders.length < D.genders.length) parts.push(filters.genders.join(', '));
    parts.forEach(part => { const span = document.createElement('span'); span.textContent = part; $('searchSummary').append(span); });
  }
  function startFromSpec(skipServer = false) {
    if (!state.spec) { showView('setup'); return; }
    state.peer = null;
    $('searchDescription').textContent = state.mode === 'game' ? gameName(state.spec.game.id) + ' için uygun bir duo arıyoruz.' : state.mode === 'date' ? 'Karşılıklı tercihlere uygun birini arıyoruz.' : 'Tercihlerine uygun anonim birini arıyoruz.';
    $('searchTitle').innerHTML = 'Birileriyle yolların<br><span>kesişmek üzere...</span>';
    $('searchNote').textContent = 'Bekleme süresi, çevrimiçi kişi ve seçtiğin filtrelere bağlıdır.';
    state.searchingSince = Date.now();
    fillSearchSummary();
    showView('search');
    state.searchTimeout = setTimeout(() => {
      if (state.view === 'search') $('searchNote').textContent = 'Henüz uygun biri bulunamadı. Daha geniş filtrelerle eşleşme şansını artırabilirsin.';
    }, 20000);
    if (!skipServer) sendSearch();
  }
  $('matchForm').addEventListener('submit', e => {
    e.preventDefault();
    const spec = extractSpec();
    const valid = D.validate(spec);
    let error = '';
    if (!spec.acceptedRules) error = 'Devam etmek için 18+ onayını ve kuralları kabul etmelisin.';
    else if (!valid) error = 'Tüm bilgilerini ve yaş aralığını kontrol et. Yaş en az 18 olmalı.';
    if (error) { $('formError').textContent = error; $('formError').hidden = false; return; }
    $('formError').hidden = true;
    state.spec = spec;
    startFromSpec();
  });
  $('editFilters').addEventListener('click', () => { socket.emit('match:cancel', {}); showView('setup'); });
  $('stopSearching').addEventListener('click', () => { socket.emit('match:cancel', {}); showView('landing'); });

  function fact(label, value) {
    const row = document.createElement('div'); row.className = 'fact';
    const k = document.createElement('span'); k.textContent = label;
    const v = document.createElement('span'); v.textContent = value;
    row.append(k, v); return row;
  }
  function renderMatch(data) {
    if (state.view !== 'search' || !data || !data.profile) return;
    state.peer = data;
    $('partnerAlias').textContent = data.alias;
    $('chatPartnerName').textContent = data.alias;
    $('partnerInitial').textContent = '✦';
    $('chatModeText').textContent = modeName(data.mode);
    const facts = [fact('Yaş', `${data.profile.age}`), fact('Şehir', data.profile.city)];
    if (data.mode === 'game' && data.game) {
      facts.push(fact('Oyun', gameName(data.game.id)), fact('Rank', data.game.rank),
        fact('Bölge', data.game.region), fact('Platform', data.game.platform),
        fact('Mikrofon', data.game.microphone), fact('Tarz', data.game.style),
        fact('Zaman', data.game.time));
    } else {
      facts.push(fact('Cinsiyet', data.profile.gender), fact('Yönelim', data.profile.orientation));
    }
    facts.push(fact('Eğitim', data.profile.education));
    $('partnerFacts').replaceChildren(...facts);
    $('typingStatus').textContent = `Anonim bağlantı • ${modeName(data.mode)}`;
    $('typingStatus').classList.remove('is-typing');
    $('messageInput').value = ''; $('charCount').textContent = '0/500';
    $('messageList').replaceChildren();
    const intro = document.createElement('div'); intro.className = 'chat-intro';
    const emblem = document.createElement('span'); emblem.textContent = '✦';
    const heading = document.createElement('strong'); heading.textContent = data.mode === 'game' ? 'Duo bulundu! 🎮' : 'Yeni bir bağlantı!';
    const p = document.createElement('p'); p.textContent = data.mode === 'game' ? 'Oyun arkadaşınla tanış! Oyun içi adını yalnızca istersen paylaş.' : 'İkiniz de anonim kalıyorsunuz. İlk mesajı göndermeye ne dersin?';
    const summary = document.createElement('p'); summary.className = 'chat-match-summary';
    summary.textContent = data.mode === 'game' && data.game ? `${gameName(data.game.id)} · ${data.game.rank} · ${data.game.region} · ${data.game.platform} · Mikrofon ${data.game.microphone.toLowerCase()}` : `${data.profile.age} yaş · ${data.profile.city} · ${data.profile.gender} · ${data.profile.education}`;
    intro.append(emblem, heading, p, summary); $('messageList').append(intro);
    showView('chat');
    toast(data.mode === 'game' ? 'Duo bulundu! İyi oyunlar 🎮' : 'Eşleştin! İyi sohbetler ✨');
  }
  function appendMessage(text, own, isoTime) {
    const intro = $('messageList').querySelector('.chat-intro'); if (intro) intro.remove();
    const row = document.createElement('div'); row.className = 'message-row ' + (own ? 'mine' : 'theirs');
    const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = text;
    const when = document.createElement('span'); when.className = 'msg-time';
    const date = isoTime ? new Date(isoTime) : new Date();
    when.textContent = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    row.append(bubble, when); $('messageList').append(row);
    $('messageList').scrollTop = $('messageList').scrollHeight;
  }
  function setEnded(title, description) {
    state.peer = null;
    $('endedTitle').textContent = title;
    $('endedText').textContent = description;
    showView('ended');
  }
  $('messageForm').addEventListener('submit', e => {
    e.preventDefault();
    if (state.view !== 'chat') return;
    const text = $('messageInput').value.trim();
    if (!text) return;
    if (!socket.connected) { toast('Bağlantın yok, mesaj gönderilemiyor.'); return; }
    if (text.length > 500) { toast('En fazla 500 karakter yazabilirsin.'); return; }
    $('sendBtn').disabled = true;
    socket.timeout(6500).emit('chat:send', { text }, (err, result) => {
      $('sendBtn').disabled = false;
      if (err || !result?.ok) { toast(result?.error || 'Mesaj iletilemedi, tekrar dene.'); return; }
      if (state.view === 'chat') appendMessage(text, true, result.time);
      // Bu süre içinde yazılmış yeni metin kaybolmasın.
      if ($('messageInput').value.trim() === text) $('messageInput').value = '';
      $('charCount').textContent = `${$('messageInput').value.length}/500`;
    });
  });
  $('messageInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault(); $('messageForm').requestSubmit();
    }
  });
  $('messageInput').addEventListener('input', () => {
    $('charCount').textContent = `${$('messageInput').value.length}/500`;
    $('messageInput').style.height = 'auto';
    $('messageInput').style.height = Math.min($('messageInput').scrollHeight, 124) + 'px';
    const now = Date.now();
    if (now - state.lastTyping > 1400 && state.view === 'chat') {
      state.lastTyping = now; socket.emit('chat:typing');
    }
  });
  $('nextBtn').addEventListener('click', () => {
    if (!state.spec) return;
    const previousPeer = state.peer;
    startFromSpec(true);
    if (socket.connected) socket.emit('match:next', {}, result => {
      if (!result?.ok && state.view === 'search') {
        state.peer = previousPeer; showView('chat');
        toast(result?.error || 'Şu an sonraki kişiye geçilemiyor.');
      }
    });
  });
  $('endChatBtn').addEventListener('click', () => {
    socket.emit('match:cancel', {});
    setEnded('Sohbeti sonlandırdın.', 'Dilersen yeni bir eşleşme arayabilir veya başka bir moda geçebilirsin.');
  });
  $('againBtn').addEventListener('click', () => startFromSpec());
  $('endedHome').addEventListener('click', () => showView('landing'));
  $('reportBtn').addEventListener('click', () => {
    $('reportReason').value = ''; $('reportDetail').value = ''; report.showModal();
  });
  $('blockBtn').addEventListener('click', () => {
    socket.timeout(6000).emit('user:block', {}, (err, result) => {
      if (err || !result?.ok) { toast('Engelleme sırasında sorun oluştu.'); return; }
      report.close(); setEnded('Kullanıcı engellendi.', 'Bu oturumda aynı kişiyle yeniden eşleşmeyeceksin.');
    });
  });
  $('reportForm').addEventListener('submit', e => {
    e.preventDefault();
    const reason = $('reportReason').value;
    if (!D.reasons.includes(reason)) { toast('Lütfen şikâyet sebebi seç.'); return; }
    const submit = $('reportForm').querySelector('button[type="submit"]'); submit.disabled = true;
    socket.timeout(8000).emit('user:report', { reason, detail: $('reportDetail').value }, (err, result) => {
      submit.disabled = false;
      if (err || !result?.ok) { toast(result?.error || 'Şikâyet gönderilemedi.'); return; }
      report.close();
      setEnded('Şikâyetin alındı.', 'Kullanıcı bu oturum için engellendi. Bildirimin yönetici incelemesine gönderildi.');
      toast('Şikâyetin gönderildi.');
    });
  });

  socket.on('connect', () => {
    if (state.view === 'search') sendSearch();
  });
  socket.on('disconnect', () => {
    if (state.view === 'chat') setEnded('Bağlantı koptu.', 'Sohbet oturumu sona erdi. Yeni eşleşme başlatabilirsin.');
    if (state.view === 'search') $('searchDescription').textContent = 'Bağlantı yenileniyor, aramaya devam edeceğiz...';
  });
  socket.on('app:stats', stats => {
    $('onlineHeader').textContent = typeof stats.online === 'number' ? stats.online : '0';
  });
  socket.on('match:searching', () => {
    if (state.view === 'search') $('searchDescription').textContent = state.mode === 'game' ? gameName(state.spec.game.id) + ' için uygun bir duo arıyoruz.' : state.mode === 'date' ? 'Karşılıklı tercihlere uygun birini arıyoruz.' : 'Tercihlerine uygun anonim birini arıyoruz.';
  });
  socket.on('match:found', renderMatch);
  socket.on('match:ended', evt => {
    if (state.view !== 'chat') return;
    if (evt.reason === 'skipped') setEnded('Karşındaki kişi sonraki eşleşmeye geçti.', 'Yeni birisiyle tanışmak için tekrar arama başlatabilirsin.');
    else setEnded('Karşındaki kişi ayrıldı.', 'Sohbet sona erdi. Yeni bir eşleşme arayabilirsin.');
  });
  socket.on('chat:message', data => {
    if (state.view !== 'chat' || typeof data?.text !== 'string') return;
    appendMessage(data.text, false, data.time);
    clearTimeout(state.typingTimeout);
    $('typingStatus').classList.remove('is-typing');
    $('typingStatus').textContent = `Anonim bağlantı • ${modeName(state.mode)}`;
  });
  socket.on('chat:typing', () => {
    if (state.view !== 'chat') return;
    $('typingStatus').textContent = 'Yazıyor...'; $('typingStatus').classList.add('is-typing');
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      $('typingStatus').classList.remove('is-typing');
      $('typingStatus').textContent = `Anonim bağlantı • ${modeName(state.mode)}`;
    }, 2200);
  });
  socket.on('app:moderated', data => { setEnded('Oturum kapatıldı.', data?.message || 'Oturum güvenlik nedeniyle kapatıldı.'); });
})();
