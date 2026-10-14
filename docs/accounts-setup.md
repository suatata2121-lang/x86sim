# Öğrenci hesapları ve admin paneli: kurulum

Site GitHub Pages üzerinde statik olarak yayınlanıyor, bu yüzden hesaplar ve
öğrenci kayıtları ücretsiz bir [Supabase](https://supabase.com) projesinde
tutuluyor (Postgres + e-posta/şifre ile giriş). Bu ayarlar yapılmadan site
eskisi gibi hesapsız çalışmaya devam eder.

## 1. Supabase projesini oluştur

1. supabase.com üzerinden ücretsiz bir proje aç (bölge olarak Frankfurt, `eu-central-1`, uygun).
2. **SQL Editor** → yeni sorgu → `supabase/schema.sql` dosyasının tamamını yapıştır → **Run**.
   Dosya tekrar çalıştırılabilir; ileride şema değişirse aynı şekilde yeniden çalıştırılır.
3. **Authentication → URL Configuration**:
   - Site URL: `https://simx86.com`
   - Redirect URLs: `https://simx86.com`, `http://localhost:5173`
4. **Authentication → Sign In / Providers → Email**: "Confirm email" açık kalsın
   (öğrenci kayıttan sonra e-postasındaki bağlantıya tıklayıp hesabını onaylar).
   Kayıt yalnızca `@halic.edu.tr` adresleriyle yapılabilir (`schema.sql` içindeki
   `require_school_email` tetikleyicisi). Başka uzantılı bir hesap gerekirse
   (ör. asistan), Supabase → **Authentication → Users → Add user** ile değil,
   tetikleyiciyi geçici olarak kapatarak eklenir:
   `alter table auth.users disable trigger require_school_email;` → hesabı aç →
   `alter table auth.users enable trigger require_school_email;`

## 2. Anahtarları GitHub'a ekle

Supabase → **Project Settings → API** sayfasından iki değer alınır:

| GitHub değişkeni         | Supabase'deki karşılığı          |
| ------------------------ | -------------------------------- |
| `VITE_SUPABASE_URL`      | Project URL                      |
| `VITE_SUPABASE_ANON_KEY` | `anon` / `public` anahtar        |

GitHub → repo → **Settings → Secrets and variables → Actions → Variables**
sekmesine bu iki değişkeni ekle. Sonraki her `main` push'unda deploy iş akışı
bunları siteye gömer.

**`service_role` anahtarını asla repoya, GitHub değişkenlerine ya da koda koyma.**
O anahtar tüm güvenlik kurallarını atlar. Sitenin ihtiyacı olan tek anahtar
`anon` anahtarıdır; bu anahtar zaten tarayıcıya gönderilmek üzere tasarlanmıştır
ve veriyi veritabanındaki satır düzeyi güvenlik (RLS) kuralları korur:
her öğrenci yalnızca kendi kayıtlarını görür, tüm kayıtları yalnızca admin görür.

Yerel geliştirme için `.env.example` dosyasını `.env.local` olarak kopyalayıp
değerleri yaz (`.env.local` git'e girmez).

## 3. Kendini admin yap

1. Sitede **Sign in → Create one** ile kendi e-postanla kayıt ol ve e-postayı onayla.
2. Supabase SQL Editor'de bir kez çalıştır:

   ```sql
   update public.profiles set role = 'admin' where email = 'senin@adresin.edu.tr';
   ```

3. Siteye tekrar girdiğinde üst menüde **📊 Admin panel** düğmesi görünür.

Rol yalnızca SQL Editor'den değiştirilebilir; öğrenciler kendi rollerini
tarayıcıdan değiştiremez.

## Neler kaydediliyor

| Kayıt                  | Ne zaman                                                    |
| ---------------------- | ----------------------------------------------------------- |
| Ziyaret ve aktif süre  | Sayfa açıkken ve sekme görünürken dakikada bir              |
| Etkinlik               | Assemble, Run, Step (toplu sayılır), Animate, ödev/örnek açma |
| Ödev denemesi          | Her **Run Tests**: geçen/toplam test sayısı ve gönderilen kodun tamamı |

## Admin panelindeki raporlar

- Özet: öğrenci sayısı, son 7 günde aktif olanlar, toplam laboratuvar süresi, ortalama tamamlanan ödev.
- Öğrenci tablosu (isim, numara ve gruba göre arama/filtre) ve ödev bazında tamamlama oranları.
- Öğrenci detayı: müfredat ilerlemesi, her test denemesi ve o denemedeki kod, son etkinlikler, ziyaretler.
- **Students CSV**, **Gradebook CSV** (öğrenci × ödev tablosu), öğrenci bazında **Attempts CSV**;
  CSV dosyaları Excel'de Türkçe karakterlerle doğru açılır.
- **Print / PDF**: tarayıcının yazdır penceresinden PDF olarak kaydedilir.

## Bilinen sınır

Ödev testleri öğrencinin tarayıcısında çalışıyor. Teknik bilgisi olan bir öğrenci
"geçti" kaydını elle gönderebilir. Her denemenin kodu saklandığı için admin
panelinden kontrol edilebilir; notlandırmaya doğrudan esas alınacaksa testlerin
sunucu tarafında (Supabase Edge Function) yeniden çalıştırılması sonraki adım olabilir.
