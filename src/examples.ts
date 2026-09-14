export interface Example {
  id: string
  title: string
  description: string
  source: string
}

export const EXAMPLES: Example[] = [
  {
    id: 'hello',
    title: 'Merhaba Dünya',
    description: 'En basit örnek: bir DB string tanımlar ve INT 21h AH=09 ile ekrana yazdırır.',
    source: `; Merhaba Dunya - en basit ornek
MSG DB 'Merhaba, Dunya!$'

MOV AH, 9
MOV DX, MSG
INT 21h

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'arithmetic',
    title: 'Aritmetik İşlemler',
    description: 'MOV, ADD, SUB ile temel yazmaç aritmetiği. "Adım" ile izleyerek AX üzerindeki değişimi gör.',
    source: `; Temel aritmetik: iki sayiyi toplar ve cikarir
MOV AX, 25
MOV BX, 17
ADD AX, BX      ; AX = 42
SUB AX, 5       ; AX = 37
MOV CX, AX      ; sonucu CX'e kopyala

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'counting-loop',
    title: 'Sayaç Döngüsü',
    description: 'LOOP komutuyla 1\'den 5\'e kadar rakamları ekrana basar.',
    source: `; 1'den 5'e kadar sayilari ekrana basar
MOV CX, 5
MOV DL, '1'
COUNTLOOP:
MOV AH, 2
INT 21h
INC DL
LOOP COUNTLOOP

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'array-sum',
    title: 'Dizi Toplama (Bellek Adresleme)',
    description: 'DB ile bir bayt dizisi ve bir string tanımlar; [NUMS+SI] ile diziyi dolaşıp toplar, sonucu string ile birlikte yazdırır.',
    source: `; Bir dizideki baytlari toplar; veri segmenti + bellek adresleme ornegi
MSG DB 'Sonuc: $'
NUMS DB 10, 20, 30, 40, 5

MOV AH, 9
MOV DX, MSG
INT 21h

MOV CX, 5
MOV SI, 0
MOV AX, 0
SUMLOOP:
MOV BL, [NUMS+SI]
MOV BH, 0
ADD AX, BX
INC SI
LOOP SUMLOOP

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'bitwise',
    title: 'Bit İşlemleri',
    description: 'AND, OR, XOR, NOT, SHL, SHR komutlarını sırayla uygular; "Adım" ile AL/BL üzerindeki değişimi izle.',
    source: `; AND/OR/XOR/NOT/SHL/SHR ornekleri
MOV AL, 0F0h
AND AL, 0FFh    ; AL = F0h
OR AL, 0Fh      ; AL = FFh
XOR AL, 0FFh    ; AL = 00h
MOV BL, AL      ; BL = 00h (kontrol icin)

MOV AL, 05h
SHL AL, 1       ; AL = 0Ah
SHR AL, 1       ; AL = 05h
NOT AL          ; AL = FAh

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'muldiv',
    title: 'Çarpma ve Bölme',
    description: 'MUL ile 6*7, ardından DIV ile 42/5 (bölüm ve kalan AL/AH\'de).',
    source: `; Carpma ve bolme: 6*7=42, sonra 42/5 (bolum 8, kalan 2)
MOV AL, 6
MOV BL, 7
MUL BL          ; AX = 42

MOV BL, 5
DIV BL          ; AL = bolum (8), AH = kalan (2)

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'call-ret',
    title: 'Alt Program (CALL/RET)',
    description: 'ADDFIVE adlı bir alt programı CALL ile üç kez çağırır, RET ile geri döner.',
    source: `; ADDFIVE alt programini uc kez cagirir (CALL/RET)
MOV AX, 0
CALL ADDFIVE
CALL ADDFIVE
CALL ADDFIVE     ; AX = 15

MOV AH, 4Ch
INT 21h

ADDFIVE:
ADD AX, 5
RET
`,
  },
  {
    id: 'max-of-two',
    title: 'Maksimumu Bulma',
    description: 'CMP ve JG ile iki sayıdan büyüğünü bulur; koşullu atlamaya iyi bir giriş.',
    source: `; Iki sayidan buyugunu bulur (CMP + kosullu atlama)
MOV AX, 37
MOV BX, 52
CMP AX, BX
JG AXBUYUK
MOV CX, BX      ; BX buyukse CX = BX
JMP SONUC
AXBUYUK:
MOV CX, AX      ; AX buyukse CX = AX
SONUC:

MOV AH, 4Ch
INT 21h
`,
  },
  {
    id: 'keyboard-echo',
    title: 'Klavye Girişi',
    description: 'INT 21h AH=0Ah ile en fazla 10 karakterlik bir satır okur, sonra tek tek AH=02 ile geri yazdırır.',
    source: `; Klavyeden en fazla 10 karakterlik bir satir okur, sonra ekrana geri yazdirir
BUF DB 10, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?

MOV DX, BUF
MOV AH, 0Ah
INT 21h

MOV CL, [BUF+1]   ; DOS'un yazdigi gercek uzunluk
MOV CH, 0
MOV SI, 0
PRINTLOOP:
CMP SI, CX
JE DONE
MOV DL, [BUF+2+SI]
MOV AH, 2
INT 21h
INC SI
JMP PRINTLOOP
DONE:

MOV AH, 4Ch
INT 21h
`,
  },
]
