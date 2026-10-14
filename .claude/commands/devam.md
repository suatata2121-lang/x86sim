---
description: Projenin güncel durumunu özetle ve sıradaki işi öner
---

Bu repoda kaldığımız yerden devam ediyoruz. Şunları yap ve sonucu Türkçe, kısa özetle:

1. `git fetch origin` ve `git status`; hangi branch'teyim, commit edilmemiş/push edilmemiş iş var mı?
2. Açık PR'lar: `gh pr list --state open` (her biri için başlık, CI durumu, birleştirilebilir mi).
3. Bekleyen planlar: `gh issue list --label plan --state open` (numara, başlık).
4. `adminNotes/notes` içinde issue'ya dönüşmemiş, hâlâ yapılmamış görünen maddeler.

Sonra sıradaki iş için tek bir öneri ver (hangi issue/PR ve neden) ve onay iste.
`gh` kurulu değilse veya giriş yapılmamışsa bunu söyle ve `gh auth login` öner.
