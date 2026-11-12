'use strict';
// Render ortam değişkenlerini doğrudan sağlar.
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const rateLimitPackage = require('express-rate-limit');
const rateLimit = rateLimitPackage.rateLimit || rateLimitPackage.default || rateLimitPackage;
const { createServer } = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const DATA = require('./shared');
const MATCH = require('./matchmaking');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render reverse proxy
app.use(helmet({ contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'], connectSrc: ["'self'", 'ws:', 'wss:'],
    fontSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
    upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
  }
}}));
app.use(compression());
app.use(express.json({ limit: '12kb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get('/shared.js', (_req, res) => res.sendFile(path.join(__dirname, 'shared.js')));
const http = createServer(app);

// Render ve benzeri reverse-proxy sunucularda tarayıcının gördüğü host,
// backend'in gördüğü hosttan farklı olabilir. Sadece aynı siteye ait
// origin'lere izin ver; keyfî başka siteleri kabul etme.
function isAllowedSocketOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // Native istemciler / origin göndermeyen istekler
  try {
    const site = new URL(origin);
    if (!['http:', 'https:'].includes(site.protocol)) return false;
    const allowed = [req.headers.host];
    const forwarded = req.headers['x-forwarded-host'];
    if (typeof forwarded === 'string') allowed.push(forwarded.split(',')[0].trim());
    const external = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_ORIGIN;
    if (external) allowed.push(new URL(external).host);
    return allowed.some(host => typeof host === 'string' && host.toLowerCase() === site.host.toLowerCase());
  } catch (_err) { return false; }
}

const io = new Server(http, {
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 10_000,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  cors: { origin: false },
  allowRequest: (req, callback) => callback(null, isAllowedSocketOrigin(req))
});

const clients = new Map();
const waiting = { chat: new Set(), date: new Set(), game: new Set() };
const reports = new Map();
const adminToken = process.env.ADMIN_TOKEN || '';
const reportSalt = process.env.REPORT_SALT || crypto.randomBytes(32).toString('hex');
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 4500
}) : null;
let databaseReady = false;
if (pool) {
  pool.query(`CREATE TABLE IF NOT EXISTS rast_reports (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    body JSONB NOT NULL,
    reviewed BOOLEAN NOT NULL DEFAULT FALSE
  )`).then(() => { databaseReady = true; console.log('PostgreSQL rapor saklama aktif.'); })
    .catch(err => console.warn('PostgreSQL bağlantısı kurulamadı; raporlar yalnızca bellekte tutulacak.', err.message));
} else console.warn('DATABASE_URL tanımlı değil: şikâyetler geçici bellekte tutulur; Render yeniden başlarsa silinir.');
if (!adminToken) console.warn('ADMIN_TOKEN eksik: yönetici paneli kullanılamaz.');

function publicStats() {
  return { online: clients.size, waiting: waiting.chat.size + waiting.date.size + waiting.game.size };
}
let statsTimer;
function broadcastStats() {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => io.emit('app:stats', publicStats()), 120);
}
function alias() { return `Yabancı #${crypto.randomInt(1000, 9999)}`; }
function safeAck(ack, result) { if (typeof ack === 'function') ack(result); }
function currentPeer(state) { return state && state.partner ? clients.get(state.partner) : null; }
function removeFromQueue(state) {
  if (state && state.mode && waiting[state.mode]) waiting[state.mode].delete(state.id);
}
function rememberEachOther(a, b) {
  const expires = Date.now() + 15 * 60 * 1000;
  a.recent.set(b.id, expires);
  b.recent.set(a.id, expires);
  // Sınırsız büyümeyi önle
  for (const state of [a, b]) {
    for (const [id, expiry] of state.recent) if (expiry < Date.now()) state.recent.delete(id);
    if (state.recent.size > 60) state.recent.delete(state.recent.keys().next().value);
  }
}
function endPair(state, partnerReason = 'left') {
  const peer = currentPeer(state);
  if (peer && peer.partner === state.id) {
    rememberEachOther(state, peer);
    peer.partner = null;
    peer.status = 'idle';
    peer.history = [];
    peer.matchFit = null;
    io.to(peer.id).emit('match:ended', { reason: partnerReason });
  }
  state.partner = null;
  state.status = 'idle';
  state.history = [];
  state.matchFit = null;
  broadcastStats();
}
function peerDetails(state) {
  const peer = currentPeer(state);
  return peer && peer.partner === state.id ? {
    alias: peer.alias, profile: peer.profile, game: peer.game || null, mode: state.mode, fit: state.matchFit
  } : null;
}
function pair(a, b, assessment) {
  removeFromQueue(a);
  removeFromQueue(b);
  a.status = 'chatting'; b.status = 'chatting';
  a.partner = b.id; b.partner = a.id;
  a.matchFit = assessment.aFit; b.matchFit = assessment.bFit;
  a.history = []; b.history = [];
  a.sentAt = []; b.sentAt = [];
  io.to(a.id).emit('match:found', { alias: b.alias, profile: b.profile, game: b.game || null, mode: a.mode, fit: a.matchFit });
  io.to(b.id).emit('match:found', { alias: a.alias, profile: a.profile, game: a.game || null, mode: b.mode, fit: b.matchFit });
  broadcastStats();
}
function runMatchmaking(now = Date.now()) {
  for (const [mode, queue] of Object.entries(waiting)) {
    const users = [];
    for (const id of [...queue]) {
      const user = clients.get(id);
      if (!user || user.status !== 'searching' || user.mode !== mode) { queue.delete(id); continue; }
      users.push(user);
      const stage = MATCH.stageFor(Math.max(0, now - user.searchingSince));
      if (user.searchStage !== stage) {
        user.searchStage = stage;
        io.to(id).emit('match:stage', { stage, message: MATCH.STAGES[stage].message });
      }
    }
    const choices = [];
    for (let i = 0; i < users.length; i++) {
      const a = users[i];
      for (let j = i + 1; j < users.length; j++) {
        const b = users[j];
        if (a.recent.get(b.id) > now || b.recent.get(a.id) > now) continue;
        const result = MATCH.assess(a, b);
        if (!result || result.requiredStage > Math.min(a.searchStage, b.searchStage)) continue;
        choices.push({ a, b, result, since: Math.min(a.searchingSince, b.searchingSince) });
      }
    }
    choices.sort((x, y) => x.result.requiredStage - y.result.requiredStage ||
      x.result.score - y.result.score || x.since - y.since);
    const taken = new Set();
    for (const choice of choices) {
      if (taken.has(choice.a.id) || taken.has(choice.b.id)) continue;
      if (choice.a.status !== 'searching' || choice.b.status !== 'searching') continue;
      taken.add(choice.a.id); taken.add(choice.b.id);
      pair(choice.a, choice.b, choice.result);
    }
  }
}
function startSearch(state) {
  removeFromQueue(state);
  state.status = 'searching';
  state.partner = null;
  state.matchFit = null;
  state.history = [];
  state.searchingSince = Date.now();
  state.searchStage = -1;
  waiting[state.mode].add(state.id);
  io.to(state.id).emit('match:searching');
  runMatchmaking();
  broadcastStats();
}
const matchTimer = setInterval(() => runMatchmaking(), 1500);
matchTimer.unref?.();
function labelIp(socket) {
  // IP asla kaydedilmez; yalnızca oturumları kısıtlamak için kısa ömürlü HMAC.
  const raw = socket.handshake.address || 'unknown';
  return crypto.createHmac('sha256', reportSalt).update(raw).digest('hex').slice(0, 20);
}
function allowedTraffic(state, key, limit, windowMs) {
  const now = Date.now();
  if (!state.limits[key] || state.limits[key].until < now) state.limits[key] = { count: 0, until: now + windowMs };
  return ++state.limits[key].count <= limit;
}
async function saveReport(report) {
  reports.set(report.id, report);
  if (reports.size > 300) reports.delete(reports.keys().next().value);
  console.log(`ŞİKÂYET ${report.id} | ${report.mode} | ${report.reason} | ${report.createdAt}`);
  if (pool && databaseReady) {
    try { await pool.query('INSERT INTO rast_reports(id, body) VALUES($1, $2::jsonb)', [report.id, JSON.stringify(report)]); }
    catch (err) { console.warn('Şikâyet DB yazma hatası:', err.message); }
  }
}

// Tarayıcı socket bağlantıları: anonim, RAM'de saklanan oturumlar.
io.on('connection', socket => {
  const state = {
    id: socket.id, alias: alias(), mode: null, profile: null, filters: null, game: null, gameFilters: null,
    status: 'idle', partner: null, history: [], recent: new Map(),
    searchingSince: 0, searchStage: -1, matchFit: null,
    limits: Object.create(null), sentAt: [], fp: labelIp(socket)
  };
  clients.set(socket.id, state);
  socket.emit('app:stats', publicStats());
  broadcastStats();

  // Tarayıcı bir eşleşme olayını kaçırmışsa sohbet ekranını geri yükleyebilir.
  socket.on('match:status', (_payload, ack) => {
    safeAck(ack, {
      ok: true,
      status: state.status,
      stage: state.status === 'searching' ? state.searchStage : null,
      peer: state.status === 'chatting' ? peerDetails(state) : null
    });
  });

  socket.on('match:start', (payload, ack) => {
    if (!allowedTraffic(state, 'search', 16, 60_000)) return safeAck(ack, { ok: false, error: 'Çok fazla arama yaptın. Biraz sonra tekrar dene.' });
    if (state.status === 'chatting') return safeAck(ack, { ok: false, error: 'Önce mevcut sohbeti sonlandır.' });
    const validated = DATA.validate(payload);
    if (!validated || payload.acceptedRules !== true) return safeAck(ack, { ok: false, error: 'Bilgilerini kontrol et. Hizmet yalnızca 18 yaş ve üzeri içindir.' });
    removeFromQueue(state);
    state.mode = validated.mode;
    state.profile = validated.profile;
    state.filters = validated.filters;
    state.game = validated.game || null;
    state.gameFilters = validated.gameFilters || null;
    safeAck(ack, { ok: true });
    startSearch(state);
  });

  socket.on('match:cancel', (_payload, ack) => {
    if (state.status === 'searching') { removeFromQueue(state); state.status = 'idle'; state.matchFit = null; broadcastStats(); }
    else if (state.status === 'chatting') endPair(state, 'left');
    safeAck(ack, { ok: true });
  });

  socket.on('match:next', (_payload, ack) => {
    if (!allowedTraffic(state, 'next', 40, 60_000)) return safeAck(ack, { ok: false, error: 'Çok hızlı eşleşme değiştiriyorsun. Biraz sonra tekrar dene.' });
    if (!state.profile) return safeAck(ack, { ok: false, error: 'Profil bulunamadı.' });
    if (state.status === 'chatting') endPair(state, 'skipped');
    if (state.status === 'searching') removeFromQueue(state);
    safeAck(ack, { ok: true });
    startSearch(state);
  });

  socket.on('chat:send', (payload, ack) => {
    const peer = currentPeer(state);
    if (!peer || peer.partner !== state.id || state.status !== 'chatting') return safeAck(ack, { ok: false, error: 'Sohbet sona erdi.' });
    if (!allowedTraffic(state, 'messages', 15, 10_000)) return safeAck(ack, { ok: false, error: 'Çok hızlı mesaj gönderiyorsun.' });
    const msg = payload && typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!msg || msg.length > 500 || /[\u0000-\u0008\u000B\u000E-\u001F]/.test(msg)) return safeAck(ack, { ok: false, error: 'Mesaj 1–500 karakter arasında olmalı.' });
    const item = { from: state.alias, text: msg, time: new Date().toISOString() };
    state.history.push(item); peer.history.push(item);
    if (state.history.length > 20) state.history.shift();
    if (peer.history.length > 20) peer.history.shift();
    io.to(peer.id).emit('chat:message', { text: msg, time: item.time });
    safeAck(ack, { ok: true, time: item.time });
  });

  socket.on('chat:typing', () => {
    const peer = currentPeer(state);
    if (!peer || peer.partner !== state.id || !allowedTraffic(state, 'typing', 12, 5000)) return;
    io.to(peer.id).emit('chat:typing');
  });

  socket.on('user:block', (_payload, ack) => {
    if (state.status !== 'chatting') return safeAck(ack, { ok: false });
    endPair(state, 'left');
    safeAck(ack, { ok: true });
  });

  socket.on('user:report', (payload, ack) => {
    const peer = currentPeer(state);
    if (!peer || peer.partner !== state.id) return safeAck(ack, { ok: false, error: 'Şikâyet yalnızca aktif eşleşme için yapılabilir.' });
    if (!allowedTraffic(state, 'report', 6, 3_600_000)) return safeAck(ack, { ok: false, error: 'Şikâyet sınırına ulaşıldı.' });
    const reason = payload && payload.reason;
    const detail = payload && typeof payload.detail === 'string' ? payload.detail.trim().slice(0, 500) : '';
    if (!DATA.reasons.includes(reason)) return safeAck(ack, { ok: false, error: 'Bir şikâyet sebebi seç.' });
    const report = {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), mode: state.mode,
      reason, detail,
      reportedAlias: peer.alias,
      reportedProfile: peer.profile,
      reportedGame: peer.game || null,
      reportedSessionId: peer.id, // yalnızca geçerli oturumla sınırlı
      reportedFingerprint: peer.fp, // tek yönlü geçici özet, IP değil
      messages: state.history.slice(-12),
      reviewed: false
    };
    void saveReport(report);
    endPair(state, 'left');
    safeAck(ack, { ok: true, reportId: report.id });
  });

  socket.on('disconnect', () => {
    if (state.status === 'chatting') endPair(state, 'disconnected');
    removeFromQueue(state);
    clients.delete(socket.id);
    broadcastStats();
  });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, ...publicStats(), uptime: Math.round(process.uptime()) }));

function verifyAdmin(req, res, next) {
  if (!adminToken) return res.status(503).json({ error: 'ADMIN_TOKEN yapılandırılmamış.' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(token), b = Buffer.from(adminToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Yetkisiz erişim.' });
  next();
}
app.get('/api/admin/reports', verifyAdmin, async (_req, res) => {
  let combined = [...reports.values()];
  if (pool && databaseReady) {
    try {
      const result = await pool.query('SELECT body, reviewed FROM rast_reports ORDER BY created_at DESC LIMIT 300');
      const byId = new Map(combined.map(r => [r.id, r]));
      for (const row of result.rows) byId.set(row.body.id, { ...row.body, reviewed: row.reviewed });
      combined = [...byId.values()];
    } catch (err) { console.warn('Admin DB okuma hatası:', err.message); }
  }
  combined.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ reports: combined.slice(0, 300), persistent: databaseReady });
});
app.post('/api/admin/reports/:id/review', verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const report = reports.get(id);
  if (report) report.reviewed = true;
  if (pool && databaseReady) {
    try {
      const result = await pool.query('UPDATE rast_reports SET reviewed=true WHERE id=$1 RETURNING id', [id]);
      if (!result.rowCount && !report) return res.status(404).json({ error: 'Bulunamadı.' });
    } catch (err) { return res.status(500).json({ error: 'Veritabanı hatası.' }); }
  } else if (!report) return res.status(404).json({ error: 'Bulunamadı.' });
  res.json({ ok: true });
});
app.post('/api/admin/reports/:id/terminate', verifyAdmin, async (req, res) => {
  let report = reports.get(req.params.id);
  if (!report && pool && databaseReady) {
    try { const r = await pool.query('SELECT body FROM rast_reports WHERE id=$1', [req.params.id]); report = r.rows[0]?.body; }
    catch (_err) { /* no op */ }
  }
  if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });
  const target = clients.get(report.reportedSessionId);
  if (!target || target.fp !== report.reportedFingerprint) return res.json({ ok: true, active: false });
  const socket = io.sockets.sockets.get(target.id);
  if (socket) { socket.emit('app:moderated', { message: 'Oturum yönetici tarafından sonlandırıldı.' }); socket.disconnect(true); }
  res.json({ ok: true, active: true });
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) http.listen(PORT, '0.0.0.0', () => console.log(`Rast aktif: http://localhost:${PORT}`));
module.exports = { app, http, io, clients, waiting, isAllowedSocketOrigin, runMatchmaking };
