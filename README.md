# rast. — Anonim Sohbet, Date ve Duo Bul

Gerçek zamanlı, **18+**, mobil ve masaüstü uyumlu, hesap açmadan çalışan anonim eşleşme sitesi. **SOHBET ET**, **DATE BUL** ve **DUO BUL** birbirinden bağımsızdır. Render üzerinde Node.js Web Service olarak çalışır.

## Özellikler

- **Üç ayrı eşleşme modu:** Sohbet Et / Date Bul / Duo Bul; farklı modlardaki kişiler birbirine bağlanmaz.
- **Karşılıklı filtreleme:** Her iki tarafın yaş aralığı, cinsiyet tercihleri, şehir, eğitim ve yönelim tercihlerinin uyduğu kullanıcılar eşleştirilir. Her filtre ayrı ayrı isteğe bağlı esnetilebilir; Date modunda açık heteroseksüel/eşcinsel yönelim beyanları da ikili cinsiyet eşleşmesinde dikkate alınır.
- **DUO BUL oyun listesi (10):** League of Legends, VALORANT, Counter-Strike 2, Fortnite, PUBG: BATTLEGROUNDS, Minecraft, Roblox, Apex Legends, Rocket League, Rainbow Six Siege.
- **Oyun eşleşmesi:** Kullanıcılar **aynı oyunu seçmişse** eşleşir; iki tarafın **rank, bölge, platform, mikrofon, oyun tarzı, oynama zamanı** filtreleri karşılıklı kontrol edilir. Rank listesi seçili oyuna göre değişir (Minecraft ve Roblox için "Derece yok"). "Farketmez" esnek filtrelemeyi sağlar.
- **Duo eşleşmesinde gizlilik:** Oyun içi ad, Discord veya kullanıcı adı istenmez; eşleşenler isterlerse sohbet sırasında paylaşır. Duo ekranında yönelim alanları gizlenir ve bu bilgi eşleşmede kullanılmaz. Platform ve rank bilgileri kullanıcı beyanıdır.
- **Anonim profil:** İsim, fotoğraf, telefon, e-posta ve üyelik yok. Takma adlar otomatik oluşturulur. Girişte 18+ onayı istenir.
- **Anlık mesajlar:** Socket.IO üzerinden mesajlaşma, yazıyor göstergesi, 500 karakter limiti.
- **Sonraki kişi / ayrıl / engelle:** Aynı iki oturum, sonraki 15 dakika boyunca tekrar eşleştirilmez.
- **Şikâyet:** Sebep + isteğe bağlı açıklama + en son 12 mesajdan kanıt. Kullanıcıya özel yönetici paneli `/admin`.
- **Temel güvenlik:** Mesajlar HTML olarak çalıştırılmaz, sunucuda giriş doğrulama ve mesaj hız limiti, Helmet güvenlik başlıkları.
- **Tasarım:** Koyu tema, animasyonlu radar bekleme ekranı, responsive mobil sohbet.

## Render'a yükleme — adım adım

1. Bu ZIP'i aç. Klasörün içindeki **tüm dosyaları** (özellikle `server.js`, `package.json`, `render.yaml`, `shared.js`, `public/`) yeni bir **GitHub repository**'sinin kök dizinine yükle. `.env` içeriğini GitHub'a koyma.
2. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint** → GitHub reposunu bağla → **Apply**. `render.yaml` web servisini oluşturur; `ADMIN_TOKEN` ve `REPORT_SALT` otomatik üretilir.
3. Deploy bitince Render sana `https://...onrender.com` adresini verir. Bu adrese girerek siteyi açabilirsin.
4. Test için bağlantıyı iki ayrı tarayıcıda veya telefon + bilgisayarda aç. Her iki tarafta da aynı modu seçip **karşılıklı uyumlu filtreler** belirle. Duo testi için iki tarafta aynı oyunu seç ve rank/bölge/platform/mikrofon tercihlerinin birbiriyle uyumlu olduğundan emin ol. Eşleşip sohbet edebilirsiniz.
5. Şikâyetleri görmek için `https://...onrender.com/admin` sayfasını aç. Render Dashboard → Service → **Environment** altında görünen `ADMIN_TOKEN` değerini gir.

**Alternatif manuel kurulum:** Render → **New Web Service** → GitHub repo → `Runtime: Node`; Build Command: `npm install --omit=dev --no-audit --no-fund`; Start Command: `npm start`; Health Check Path: `/api/health`. Environment bölümünden uzun ve tahmin edilmesi zor bir `ADMIN_TOKEN` ile `REPORT_SALT` ekle.

> **ÖNEMLİ — raporların kalıcılığı:** Ücretsiz Render web servisi dosya sistemi kalıcı değildir. `DATABASE_URL` eklenmezse şikâyetler sunucu belleğinde ve özet olarak Render loglarında bulunur; **yeniden başlatılınca bellek kayıtları silinir**. Gerçek kullanıcılarla kalıcı kullanım için dış PostgreSQL veritabanı bağla (ör. Render Postgres ücretli planı veya dış sağlayıcı). `DATABASE_URL` eklendiğinde `rast_reports` tablosu otomatik oluşturulur, şikâyetler kalıcı tutulur. PostgreSQL sağlayıcın TLS gerektiriyorsa `DB_SSL=true` kullan.

> Render ücretsiz servisi hareketsizlikte uyuyabilir. İlk ziyaret yavaş açılabilir ve canlı bağlantılar servis uykuya girdiğinde kesilebilir. Sürekli trafik için uygun bir servis planı seç.

## Halihazırda yayındaki siteyi güncelleme

Önceden RAST sitesini GitHub'a yükleyip Render'da yayınladıysan **yeni bir Render servisi açmana gerek yok**. Bu ZIP içindeki güncel dosyaları aynı GitHub reposunun kök dizinine yükleyip eskilerinin üzerine yaz ve değişiklikleri commit/push yap. Render'ın otomatik deploy'u açıksa site yeniden yayınlanır; değilse Render → servis → **Manual Deploy → Deploy latest commit** yolunu kullan. Mevcut `ADMIN_TOKEN`, `REPORT_SALT` ve varsa `DATABASE_URL` değerlerini değiştirme. Mevcut iki mod korunur, üçüncü mod eklenir.

## Lokal geliştirme

Node.js 20+ gerekir.

```bash
npm install
npm start
```

`http://localhost:3000` adresini aç. Geliştirme için `npm run dev` kullanılabilir. Yerel admin paneli için:

```bash
# Linux / macOS
ADMIN_TOKEN=uzun-gizli-sifren REPORT_SALT=ayri-bir-sifre npm start

# Windows PowerShell
$env:ADMIN_TOKEN="uzun-gizli-sifren"; $env:REPORT_SALT="ayri-bir-sifre"; npm start
```

`.env.example` dosyası ayar referansıdır; Node otomatik `.env` yüklemez. Node 20.6+ üzerinde `.env` dosyası oluşturup `node --env-file=.env server.js` komutunu da kullanabilirsin.

### Test

```bash
npm test
```

## Yasal ve güvenlik notları (yayına açmadan önce oku)

- Uygulama **18+ beyanı** alır ama **kimlik/yaş doğrulaması yapmaz**. Bu nedenle 18 yaş altı kullanımın önlenmesini garanti etmez. Herkese açık büyük ölçekte kullanım öncesinde etkili yaş doğrulaması, istismar önleme ve moderasyon süreçleri gereklidir.
- Anonimlik **üyeliksiz/takma adla** kullanımı anlatır. Bu bir "tam iz bırakmama" sistemi değildir: IP erişimi altyapı hizmetlerinde loglanabilir, şikâyetler profil ve mesaj örneklerini saklayabilir. Mesajlar **uçtan uca şifreli değildir**.
- Her yeni eşleşmede önceki konuşmalar sıfırlanır, normal sohbetler veritabanına kaydedilmez. Şikâyet oluşturulursa son 12 mesaj inceleme amaçlı rapora eklenir.
- **KVKK kapsamında** uygun aydınlatma metni, gizlilik/çerez politikası, veri saklama-silme süresi ve şikâyet/başvuru kanalı oluştur. Şimdiki durum bir MVP'dir, eksiksiz yasal uygunluk iddiası yoktur.
- Yönetici panelindeki oturum sonlandırma yalnızca halen bağlı olan oturum için geçerlidir; hesap veya uzun süreli kalıcı ban bulunmaz. Büyük ölçek için doğrulama, kötüye kullanım ve bot önleme, profesyonel moderasyon, rapor takip iş akışı önerilir.
- Tek sunucu örneği üzerinde bellek içi eşleştirme yapılır. Kullanıcıların oyun bilgileri saklanmaz; aktif oturum için tutulur. Render'da **1 instance** çalıştır; yatay ölçek için Redis adapter + ortak queue gerekir.

## Dosya düzeni

```text
rast-anonim/
├── server.js          # Node/Express/Socket.IO gerçek zamanlı backend
├── shared.js          # Filtre veri/validasyon/eşleşme kuralları
├── public/
│   ├── index.html     # Arayüz
│   ├── style.css      # Responsive tasarım/animasyonlar
│   ├── app.js         # Kullanıcı arayüzü ve socket olayları
│   ├── admin.html     # Yönetici rapor paneli
│   ├── admin.css
│   ├── admin.js
│   └── favicon.svg
├── tests/             # Eşleşme/validasyon testleri
├── render.yaml        # Render Blueprint
├── package.json
└── .env.example
```

Bir sorun olursa Render'daki **Logs** sekmesini kontrol et. Sunucuda `/api/health` adresi `{ "ok": true, ... }` döndürür.
