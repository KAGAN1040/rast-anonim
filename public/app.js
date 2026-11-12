(() => {
  'use strict';
  const D = window.RAST_DATA;
  const statusEl = document.getElementById('connectionStatus');
  if (!D || typeof window.io !== 'function') {
    if (statusEl) statusEl.textContent = 'Bağlantı dosyaları yüklenemedi. Sayfayı yenile.';
    return;
  }
  // Polling, WebSocket'i engelleyen tarayıcı ve ağlarda yedek bağlantıdır.
  const socket = io({
    transports: ['polling', 'websocket'], upgrade: true, tryAllTransports: true,
    reconnection: true, reconnectionAttempts: Infinity,
    reconnectionDelay: 800, reconnectionDelayMax: 6500, timeout: 15000
  });
  const $ = id => document.getElementById(id);
  const pages = ['landing', 'setup', 'search', 'chat', 'ended'];
  const state = { mode: 'chat', view: 'landing', spec: null, peer: null, preferred: new Set(D.genders), selectedGame: null, searchingSince: 0, typingTimeout: null, searchTimeout: null, retryTimer: null, searchInFlight: false, retryCount: 0, toastTimeout: null, lastTyping: 0 };

  function showView(view) {
    state.view = view;
    pages.forEach(id => {
      const el = $(id); const current = id === view;
      el.hidden = !current; el.classList.toggle('active', current);
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (view === 'chat') setTimeout(() => $('messageInput').focus({ preventScroll: true }), 180);
    if (view !== 'search') {
      clearTimeout(state.searchTimeout);
      clearTimeout(state.retryTimer);
      state.retryCount = 0;
    }
  }
  function updateConnection(connected, message) {
    if (!statusEl) return;
    statusEl.classList.toggle('is-online', connected);
    statusEl.textContent = message || (connected ? 'Bağlı' : 'Bağlanıyor...');
    statusEl.title = connected ? 'Canlı sunucu bağlantısı kuruldu' : 'Sunucuyla bağlantı kurulamadı';
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
  setOptions('myGender', D.genders); setOptions('reportReason', D.reasons);
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
        state.preferred.has(gender) ? state.preferred.delete(gender) : state.preferred.add(gender);
        renderChips();
      });
      wrap.append(btn);
    });
  }
  renderChips();
  function openMode(mode) {
    state.mode = mode;
    state.preferred = new Set(D.genders); renderChips();
    $('gamingSection').hidden = mode !== 'game';
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
      profile: { age: Number($('myAge').value), gender: $('myGender').value },
      filters: {
        minAge: Number($('minAge').value), maxAge: Number($('maxAge').value),
        genders: D.genders.filter(g => state.preferred.has(g))
      },
      ...(state.mode === 'game' ? {
        game: { id: state.selectedGame, rank: $('myGameRank').value },
        gameFilters: { rank: $('filterGameRank').value }
      } : {})
    };
  }
  function scheduleSearchRecovery() {
    if (state.view !== 'search') return;
    clearTimeout(state.retryTimer);
    state.retryCount += 1;
    state.retryTimer = setTimeout(recoverSearch, Math.min(13000, 2200 * state.retryCount));
  }
  function sendSearch() {
    if (state.view !== 'search' || !state.spec || state.searchInFlight) return;
    if (!socket.connected) {
      $('searchDescription').textContent = 'Sunucuya bağlanılıyor... Bağlantı kurulunca arama başlayacak.';
      return;
    }
    state.searchInFlight = true;
    socket.timeout(9500).emit('match:start', state.spec, (err, result) => {
      state.searchInFlight = false;
      if (state.view !== 'search') return;
      if (err) {
        $('searchDescription').textContent = 'Sunucu yanıt vermedi; bağlantı kontrol edilip tekrar denenecek.';
        scheduleSearchRecovery();
      } else if (!result?.ok) {
        toast(result?.error || 'Eşleşme başlatılamadı.');
        showView('setup');
      } else {
        state.retryCount = 0;
        clearTimeout(state.retryTimer);
        // Eşleşme olayı kaybolursa sohbet durumunu kurtar.
        state.retryTimer = setTimeout(recoverSearch, 5000);
      }
    });
  }
  function recoverSearch() {
    if (state.view !== 'search' || !state.spec) return;
    if (!socket.connected) {
      $('searchDescription').textContent = 'Bağlantı bekleniyor; internet bağlantını kontrol et.';
      return;
    }
    socket.timeout(6500).emit('match:status', {}, (err, result) => {
      if (state.view !== 'search') return;
      if (err || !result?.ok) {
        $('searchDescription').textContent = 'Sunucuya erişim deneniyor...';
        scheduleSearchRecovery();
      } else if (result.status === 'chatting' && result.peer) {
        renderMatch(result.peer);
      } else if (result.status === 'searching') {
        clearTimeout(state.retryTimer);
        state.retryCount = 0;
        $('searchDescription').textContent = 'Bağlantı kuruldu. Uygun biri aranıyor...';
      } else {
        sendSearch();
      }
    });
  }
  function fillSearchSummary() {
    const { filters, mode } = state.spec;
    $('searchSummary').replaceChildren();
    const parts = [mode === 'game' ? '🎮 Duo · ' + gameName(state.spec.game.id) : mode === 'chat' ? '💬 Sohbet' : '♥ Date', `${filters.minAge}–${filters.maxAge} yaş`];
    if (filters.genders.length < D.genders.length) parts.push(filters.genders.join(', '));
    if (mode === 'game') {
      parts.push('Rankın: ' + state.spec.game.rank);
      if (state.spec.gameFilters.rank !== D.any) parts.push('Aradığın rank: ' + state.spec.gameFilters.rank);
    }
    parts.forEach(part => { const span = document.createElement('span'); span.textContent = part; $('searchSummary').append(span); });
  }
  function startFromSpec(skipServer = false) {
    if (!state.spec) { showView('setup'); return; }
    state.peer = null;
    state.searchInFlight = false;
    clearTimeout(state.retryTimer);
    $('searchDescription').textContent = state.mode === 'game' ? gameName(state.spec.game.id) + ' için uygun bir duo arıyoruz.' : state.mode === 'date' ? 'Yaş ve cinsiyet tercihlerine uygun birini arıyoruz.' : 'Yaş ve cinsiyet tercihlerine uygun birini arıyoruz.';
    $('searchTitle').innerHTML = 'Birileriyle yolların<br><span>kesişmek üzere...</span>';
    $('searchNote').textContent = 'Bekleme süresi, çevrimiçi kişi sayısına bağlıdır.';
    state.searchingSince = Date.now();
    fillSearchSummary();
    showView('search');
    state.searchTimeout = setTimeout(() => {
      if (state.view === 'search') $('searchNote').textContent = 'Henüz uygun biri bulunamadı. Aramaya devam ediyoruz; istersen yaş ve cinsiyet tercihlerini genişletebilirsin.';
    }, 20000);
    if (!skipServer) sendSearch();
  }
  $('matchForm').addEventListener('submit', e => {
    e.preventDefault();
    const spec = extractSpec();
    const valid = D.validate(spec);
    let error = '';
    if (!spec.acceptedRules) error = 'Devam etmek için 18+ onayını ve kuralları kabul etmelisin.';
    else if (!valid) error = 'Yaşını, cinsiyetini ve tercihlerini kontrol et. Yaş en az 18 olmalı. Duo için oyun ve rank da seçmelisin.';
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
    const facts = [fact('Yaş', `${data.profile.age}`), fact('Cinsiyet', data.profile.gender)];
    if (data.mode === 'game' && data.game) facts.push(fact('Oyun', gameName(data.game.id)), fact('Rank', data.game.rank));
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
    summary.textContent = data.mode === 'game' && data.game ? `${gameName(data.game.id)} · ${data.game.rank}` : `${data.profile.age} yaş · ${data.profile.gender}`;
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
    updateConnection(true);
    if (state.view === 'search') recoverSearch();
  });
  socket.on('connect_error', () => {
    updateConnection(false, 'Sunucuya ulaşılamıyor');
    if (state.view === 'search') $('searchDescription').textContent = 'Sunucuya ulaşılamıyor. İnternet bağlantını kontrol et, otomatik yeniden deniyoruz.';
  });
  socket.on('disconnect', () => {
    updateConnection(false, 'Bağlantı kesildi');
    if (state.view === 'chat') setEnded('Bağlantı koptu.', 'Sohbet oturumu sona erdi. Yeni eşleşme başlatabilirsin.');
    state.searchInFlight = false;
    if (state.view === 'search') $('searchDescription').textContent = 'Bağlantı yenileniyor, yeniden bağlanınca arama devam edecek...';
  });
  socket.on('app:stats', stats => {
    $('onlineHeader').textContent = typeof stats.online === 'number' ? stats.online : '0';
  });
  socket.on('match:searching', () => {
    if (state.view === 'search') $('searchDescription').textContent = state.mode === 'game' ? gameName(state.spec.game.id) + ' için uygun bir duo arıyoruz.' : state.mode === 'date' ? 'Yaş ve cinsiyet tercihlerine uygun birini arıyoruz.' : 'Yaş ve cinsiyet tercihlerine uygun birini arıyoruz.';
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
