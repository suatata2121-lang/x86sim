# x86sim

Tarayıcı tabanlı, [emu8086](https://emu8086-microprocessor-emulator.en.softonic.com/)'dan ilham alan bir 8086 assembly simülatörü. React + TypeScript + Vite ile geliştiriliyor.

## Durum

Erken aşama. Şu an çalışan:

- Bir assembler (`src/core/assembler.ts`): etiketler, yorumlar, `DB`/`DW` veri direktifleri, bellek operandları (`[BX]`, `[SI+4]`, `[MSG]`, `[MSG+SI]`, `BYTE/WORD PTR`), işlenen sayısı/türü ve tanımsız-etiket doğrulaması (derleme zamanında hata verir)
- Bir 8086 CPU çekirdeği (`src/core/cpu.ts`): 16/8-bit yazmaçlar, bayraklar, 64K düz bellek, veri etiketlerinin belleğe yerleştirilmesi, `INT 21h` desteği (AH=01 karakter oku, AH=02 karakter yazdır, AH=09 `$`-sonlandırmalı string yazdır, AH=0Ah tamponlu satır oku, AH=4Ch çıkış)
- Desteklenen komutlar: `MOV ADD SUB INC DEC CMP MUL DIV AND OR XOR NOT SHL SHR JMP JE JNE JG JL JGE JLE LOOP PUSH POP CALL RET INT NOP HLT` (kaynak/hedef olarak yazmaç, sayı ya da bellek adresi)
- Adım adım / tam çalıştırma, yazmaç ve bayrak görünümü, derleme + çalışma zamanı hata gösterimi olan minimal bir arayüz
- Bir bellek görüntüleyici (`src/components/MemoryView.tsx`): 16x16 hex dump + ASCII, adrese/SP'ye/veri etiketlerine atlama
- Kesme noktaları (breakpoint): editörün kenar şeridinden (`src/components/CodeEditor.tsx`) satıra tıklayarak aç/kapat; "Çalıştır" o satıra gelmeden hemen önce durur, tekrar "Çalıştır"a basınca devam eder
- Klavye girişi: `INT 21h AH=01` (tek karakter) ve `AH=0Ah` (tamponlu satır) programı beklemeye alır, arayüzde bir giriş kutusu çıkar; kullanıcı "Gönder"e basınca (veya Enter'a) yürütme kaldığı yerden devam eder

### Bilinen sınırlamalar

- Taban + indeks kombinasyonu (`[BX+SI]` gibi) desteklenmiyor — en fazla bir taban yazmacı (`BX/BP/SI/DI`) + bir etiket + bir sabit ofset.
- Bellek işleneninin boyutu (`BYTE`/`WORD PTR` verilmediğinde) bir yazmaçtan çıkarılamıyorsa varsayılan olarak word (16-bit) kabul edilir; MASM'deki gibi "boyut belirsiz" hatası verilmez.
- Segment yazmaçları (`DS/ES/SS/CS`) yok; bellek düz (flat) 64K olarak modelleniyor.
- `SHL`/`SHR` çok bitlik kaydırmalarda `OF` bayrağını her zaman `false` yapar (gerçek 8086'da `OF` yalnızca 1 bitlik kaydırmada tanımlıdır); `CF` doğru hesaplanır.
- `CALL`/`RET` yalnızca bu programın kendi etiketleri arasında çalışır (gerçek bellek adresleri değil, komut dizisindeki indeks döner); iç içe alt programlar için yeterlidir ama gerçek 8086 CS:IP semantiğini birebir modellemez.
- `INT 21h AH=0Ah` tampona sonundaki `0Dh` (Enter) baytını yazmaz, yalnızca girilen karakterleri ve gerçek uzunluğu (`buffer[1]`) yazar; gerçek DOS'un aksine ilk bayttaki maksimum değeri (`buffer[0]`) doğrudan "en fazla okunacak karakter" olarak kullanır (CR için 1 eksiltmez).

## Yapılacaklar (yol haritası)

- [x] Veri segmenti / `DB`, `DW` direktifleri ve bellek üzerinden adresleme
- [x] Bellek görüntüleyici (hex dump) arayüzü
- [x] Eksik komutlar: `MUL DIV AND OR XOR NOT SHL SHR CALL RET`
- [x] `INT 21h` AH=09 (string yazdırma)
- [x] `INT 21h` AH=01/0A (klavye girişi)
- [x] Breakpoint desteği
- [ ] Assembler hata mesajlarının iyileştirilmesi (kolon/karakter konumu)
- [ ] Örnek program kütüphanesi
- [ ] `[BX+SI]` tarzı taban+indeks adresleme

## Geliştirme

```bash
npm install
npm run dev
```

## Yapı

```
src/
  core/
    types.ts        # ortak tipler (Instruction, Operand, Flags, ...)
    assembler.ts     # kaynak kod -> Instruction[] çevirici
    cpu.ts            # CPU durumu ve komut yürütme
  components/
    RegisterView.tsx # yazmaç/bayrak paneli
    MemoryView.tsx   # bellek hex dump / gezinme paneli
    CodeEditor.tsx   # satır numaralı editör + breakpoint kenar şeridi
  App.tsx             # editör + kontroller + üst düzey akış
```
