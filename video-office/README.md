# 🎬 AI Video Ofisi

Claude agentlaridan iborat "virtual studiya". Siz g'oya yozasiz, agentlar jamoasi esa tayyor MP4 video chiqarib beradi. **Standart rejim butunlay bepul.**

```
Siz: /make-video "Qahvaxona uchun 25 soniyalik Reels"
        │
   🎩 Producer (/make-video)  ── brif, nazorat
        │
   ✍️  scriptwriter       → script.md
   🎨 storyboard-artist  → storyboard.json
   🎙️  voice-artist       → audio/*.mp3       (Edge neyron ovozi, o'zbekcha)
   🎥 visual-generator   → clips/*.mp4       (Flux rasm + kinematografik kamera harakati)
   ✂️  editor             → final.mp4         (ffmpeg: montaj + subtitr + musiqa)
   🔍 qa-reviewer        → qa-report.md      → kerak bo'lsa sahnani qayta ishlashga qaytaradi
```

## Uch xil sifat darajasi

| Daraja | Ovoz | Video | Narx |
|---|---|---|---|
| **1. Bepul, avtomatik** (standart) | Microsoft Edge neyron ovozi — haqiqiy o'zbekcha `Madina` / `Sardor` | Flux AI rasm + silliq kamera harakati (Ken Burns), 1080p | **$0** |
| **2. Bepul, premium** (yarim qo'lda) | Edge | Kling / Hailuo / Vidu saytlaridagi **kunlik bepul kreditlar**da yaratilgan haqiqiy AI video | **$0** |
| **3. Pullik, to'liq avtomatik** | ElevenLabs | Runway Gen-4 | ~$1.5–2 / video |

**Ochiq gap:** haqiqiy harakatlanuvchi AI video (odam yuradi, suv oqadi) yaratish qimmat GPU talab qiladi. Shuning uchun bunday videoni bepul va to'liq avtomatik beradigan barqaror API yo'q.
- 1-daraja: "jonli fotosurat" uslubidagi professional video. Hujjatli filmlar, reklama va Reels'da keng ishlatiladi.
- 2-daraja: eng yuqori sifat, bepul. Faqat har sahna uchun klipni saytdan o'zingiz yuklab olasiz, qolganini ofis bajaradi.

## O'rnatish (bir marta)

```bash
# 1. Dasturlar: Node.js 18+, ffmpeg, Python 3
pip install edge-tts

# 2. (ixtiyoriy) sozlamalar
cd video-office && cp .env.example .env
```

Kalit kerak emas. Bepul rejim internetga ulanishni talab qiladi: Pollinations va Microsoft TTS.

## Ishlatish

Repozitoriy ildizida Claude Code'ni oching va yozing:

```
/make-video Toshkentdagi "Tong" qahvaxonasi uchun 25 soniyalik Instagram Reels reklama, o'zbek tilida
```

Pullik rejim uchun `--paid`, oflayn test uchun `--mock` qo'shing.

### 2-daraja: bepul premium klip qo'shish
1. Ofis storiboardni tayyorlaydi. Har bir sahnaning `visual_prompt` va `motion_prompt` i `storyboard.json` da turadi.
2. Promptni [klingai.com](https://klingai.com), [hailuoai.video](https://hailuoai.video) yoki [vidu.com](https://www.vidu.com) saytiga kiritib, bepul kunlik kredit bilan klip yarating.
3. Klipni `projects/<loyiha>/clips/scene-01.mp4`, `scene-02.mp4` va hokazo nomlar bilan saqlang.
4. `/make-video` ni davom ettiring yoki `node pipeline.mjs projects/<loyiha>` ni ishga tushiring. Siz qo'ygan kliplar saqlanadi, yetishmaganlari bepul usulda yaratiladi.

Sahnalarni aralashtirish ham mumkin: muhim 1–2 sahna premium, qolganlari avtomatik.

## Qo'lda ishlatish (Claude'siz)

```bash
cd video-office
npm run demo                                                  # namuna loyiha, bepul rejim
node pipeline.mjs projects/<loyiha>                           # bepul
node pipeline.mjs projects/<loyiha> --provider paid           # Runway + ElevenLabs
node tools/gen-clip.mjs projects/<loyiha> --scene 2 --force   # faqat 2-sahnani qayta yaratish
node tools/assemble.mjs projects/<loyiha>                     # faqat qayta montaj
```

## Loyiha tuzilishi

```
projects/<loyiha>/
├── brief.md          vazifa
├── script.md         ssenariy
├── storyboard.json   sahnalar: narration, visual_prompt, motion_prompt, duration, seed
├── music.mp3         ixtiyoriy fon musiqasi (bepul: pixabay.com/music)
├── images/  audio/  clips/  build/
├── final.mp4         ✅ tayyor video
└── qa-report.md
```

`storyboard.json` ning to'liq sxemasi: [`.claude/agents/storyboard-artist.md`](../.claude/agents/storyboard-artist.md).

## Sifat bo'yicha maslahatlar
- **Rasm yoqmasa:** sahnaga boshqa `"seed"` bering va `--scene N --force` bilan qayta yarating.
- **Ovoz:** raqamlarni so'z bilan yozing. Tezlik `.env` dagi `EDGE_RATE` bilan o'zgartiriladi.
- **Musiqa:** Pixabay Music yoki YouTube Audio Library'dan bepul, mualliflik huquqisiz trek oling va `music.mp3` deb saqlang.
- **Uslub:** barcha sahnalarga bir xil `style` yozing, masalan `"warm cinematic, golden hour, 35mm film"`. Shunda video yaxlit ko'rinadi.

## Cheklovlar
- Bepul xizmatlarning navbati va limiti bor. Pollinations band bo'lsa, skript o'zi kutib qayta urinadi.
- Runway klipi bir sahnada eng ko'pi bilan 10 soniya.
