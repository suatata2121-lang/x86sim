# x86sim

Tarayıcı tabanlı, [emu8086](https://emu8086-microprocessor-emulator.en.softonic.com/)'dan ilham alan bir 8086 assembly simülatörü. React + TypeScript + Vite ile geliştiriliyor.

## Durum

Erken aşama. Şu an çalışan:

- Basit bir assembler (`src/core/assembler.ts`): etiketler, yorumlar, temel komutlar
- Bir 8086 CPU çekirdeği (`src/core/cpu.ts`): 16/8-bit yazmaçlar, bayraklar, 64K bellek, temel `INT 21h` desteği (AH=02 karakter yazdır, AH=4Ch çıkış)
- Desteklenen komutlar: `MOV ADD SUB INC DEC CMP JMP JE JNE JG JL JGE JLE LOOP PUSH POP INT NOP HLT`
- Adım adım / tam çalıştırma, yazmaç ve bayrak görünümü olan minimal bir arayüz

## Yapılacaklar (yol haritası)

- [ ] Veri segmenti / `DB`, `DW` direktifleri ve bellek üzerinden adresleme
- [ ] Bellek görüntüleyici (hex dump) arayüzü
- [ ] Eksik komutlar: `MUL DIV AND OR XOR NOT SHL SHR CALL RET`
- [ ] `INT 21h` AH=09 (string yazdırma), AH=01/0A (klavye girişi)
- [ ] Breakpoint desteği
- [ ] Assembler hata mesajlarının iyileştirilmesi (kolon/karakter konumu)
- [ ] Örnek program kütüphanesi

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
