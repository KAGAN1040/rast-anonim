(() => {
  const $ = id => document.getElementById(id);
  let token = '';
  async function req(url, method = 'GET') {
    const response = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'İstek başarısız.');
    return data;
  }
  function text(parent, tag, content, className = '') {
    const node = document.createElement(tag); node.textContent = content; if (className) node.className = className;
    parent.append(node); return node;
  }
  function makeButton(parent, label, callback, className = '') {
    const b = text(parent, 'button', label, className); b.type = 'button'; b.addEventListener('click', callback); return b;
  }
  async function load() {
    $('adminError').textContent = '';
    try {
      const data = await req('/api/admin/reports');
      $('adminLogin').hidden = true; $('adminApp').hidden = false;
      $('adminStatus').textContent = `${data.reports.length} şikâyet • ${data.persistent ? 'PostgreSQL kalıcı kayıt' : 'geçici bellek (yeniden başlatmada silinir)'}`;
      $('reportList').replaceChildren();
      if (!data.reports.length) text($('reportList'), 'p', 'Henüz bir şikâyet bulunmuyor.');
      data.reports.forEach(item => {
        const card = document.createElement('article'); card.className = 'report-card' + (item.reviewed ? ' reviewed' : '');
        const head = text(card, 'div', '', 'report-top');
        text(head, 'strong', item.reason + (item.reviewed ? ' ✓ İncelendi' : ''));
        text(head, 'span', new Date(item.createdAt).toLocaleString('tr-TR'));
        text(card, 'div', `Mod: ${item.mode === 'date' ? 'DATE' : item.mode === 'game' ? 'DUO' : 'SOHBET'} | Oturum: ${item.reportedAlias} | ID: ${item.id}`, 'report-meta');
        if (item.reportedProfile) {
          const p = item.reportedProfile;
          text(card, 'div', `${p.age} yaş | ${p.city} | ${p.gender} | ${p.orientation} | ${p.education}`, 'report-meta');
        }
        if (item.reportedGame) {
          const g = item.reportedGame;
          text(card, 'div', `Oyun: ${g.id} | Rank: ${g.rank} | Bölge: ${g.region} | Platform: ${g.platform} | Mikrofon: ${g.microphone}`, 'report-meta');
        }
        text(card, 'p', item.detail || 'Ek açıklama yok.', 'report-detail');
        if (item.messages?.length) {
          const history = item.messages.map(m => `${m.from}: ${m.text}`).join('\n');
          text(card, 'div', history, 'report-history');
        }
        const actions = text(card, 'div', '', 'report-actions');
        if (!item.reviewed) makeButton(actions, 'İncelendi', async () => {
          try { await req('/api/admin/reports/' + encodeURIComponent(item.id) + '/review', 'POST'); await load(); }
          catch (e) { $('adminError').textContent = e.message; }
        });
        makeButton(actions, 'Aktif oturumu kapat', async () => {
          if (!window.confirm('Şikâyet edilen aktif oturumu kapatmak istiyor musun?')) return;
          try {
            const result = await req('/api/admin/reports/' + encodeURIComponent(item.id) + '/terminate', 'POST');
            window.alert(result.active ? 'Oturum sonlandırıldı.' : 'Bu oturum artık aktif değil.');
          } catch (e) { $('adminError').textContent = e.message; }
        }, 'danger');
        $('reportList').append(card);
      });
    } catch (e) { $('adminError').textContent = e.message; }
  }
  $('loginBtn').addEventListener('click', () => { token = $('adminToken').value.trim(); if (token) void load(); });
  $('refreshBtn').addEventListener('click', () => void load());
  $('logoutBtn').addEventListener('click', () => { token = ''; $('adminToken').value = ''; $('adminLogin').hidden = false; $('adminApp').hidden = true; });
  $('adminToken').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginBtn').click(); });
})();
