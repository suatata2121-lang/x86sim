# x86sim

Tarayıcı tabanlı, [emu8086](https://emu8086-microprocessor-emulator.en.softonic.com/)'dan ilham alan bir 8086 assembly simülatörü. React + TypeScript + Vite ile geliştiriliyor.

## Durum

Erken aşama. Şu an çalışan:

- Bir assembler (`src/core/assembler.ts`): etiketler, yorumlar, `DB`/`DW` veri direktifleri, bellek operandları (`[BX]`, `[SI+4]`, `[MSG]`, `[MSG+SI]`, `BYTE/WORD PTR`), işlenen sayısı/türü ve tanımsız-etiket doğrulaması (derleme zamanında hata verir)
- Bir 8086 CPU çekirdeği (`src/core/cpu.ts`): 16/8-bit yazmaçlar, bayraklar, 64K düz bellek, veri etiketlerinin belleğe yerleştirilmesi, `INT 21h` desteği (AH=02 karakter yazdır, AH=09 `$`-sonlandırmalı string yazdır, AH=4Ch çıkış)
- Desteklenen komutlar: `MOV ADD SUB INC DEC CMP JMP JE JNE JG JL JGE JLE LOOP PUSH POP INT NOP HLT` (kaynak/hedef olarak yazmaç, sayı ya da bellek adresi)
- Adım adım / tam çalıştırma, yazmaç ve bayrak görünümü, derleme + çalışma zamanı hata gösterimi olan minimal bir arayüz

### Bilinen sınırlamalar

- Taban + indeks kombinasyonu (`[BX+SI]` gibi) desteklenmiyor — en fazla bir taban yazmacı (`BX/BP/SI/DI`) + bir etiket + bir sabit ofset.
- Bellek işleneninin boyutu (`BYTE`/`WORD PTR` verilmediğinde) bir yazmaçtan çıkarılamıyorsa varsayılan olarak word (16-bit) kabul edilir; MASM'deki gibi "boyut belirsiz" hatası verilmez.
- Segment yazmaçları (`DS/ES/SS/CS`) yok; bellek düz (flat) 64K olarak modelleniyor.

## Yapılacaklar (yol haritası)

- [x] Veri segmenti / `DB`, `DW` direktifleri ve bellek üzerinden adresleme
- [ ] Bellek görüntüleyici (hex dump) arayüzü
- [ ] Eksik komutlar: `MUL DIV AND OR XOR NOT SHL SHR CALL RET`
- [x] `INT 21h` AH=09 (string yazdırma)
- [ ] `INT 21h` AH=01/0A (klavye girişi)
- [ ] Breakpoint desteği
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
  App.tsx             # editör + kontroller + üst düzey akış
```
