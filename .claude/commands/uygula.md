---
description: Bir plan issue'sunu uygula ve PR aç (kullanım /uygula 12)
argument-hint: <issue-numarası>
---

Issue #$ARGUMENTS'ı uygula.

1. `gh issue view $ARGUMENTS --comments` ile spesifikasyonu oku. Belirsiz bir nokta
   kararı değiştiriyorsa önce bana sor; değiştirmiyorsa makul varsayılanı seç ve PR'da yaz.
2. `main`'den yeni bir branch aç (`git switch -c plan-$ARGUMENTS-<kısa-ad> origin/main`).
   Issue başka bir açık PR'a bağlıysa o branch'ten başla.
3. CLAUDE.md'deki kurallara uyarak uygula. Veritabanı değişikliği varsa
   `supabase/schema.sql`'i güncelle (RLS ile, tekrar çalıştırılabilir).
4. `npm run build` temiz geçmeli. Arayüz değiştiyse `npm run dev` ile sayfayı kontrol et.
5. Commit, push, `gh pr create --draft` ile PR aç; gövdede `Closes #$ARGUMENTS`,
   ne değiştiğini (önce/sonra) ve şema yeniden çalıştırılmalı mı yaz.
6. Bana PR bağlantısını ve test etmem gereken şeyi Türkçe, birkaç satırda söyle.
