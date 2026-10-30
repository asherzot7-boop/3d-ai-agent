# 🎬 AI Video Ofisi

Claude agentlaridan iborat "virtual studiya". Siz g'oya yozasiz, agentlar jamoasi esa tayyor MP4 video chiqarib beradi.

```
Siz: /make-video "Qahvaxona uchun 25 soniyalik Reels"
        │
   🎩 Producer (/make-video)  ── brif, nazorat, tasdiq so'rash
        │
   ✍️  scriptwriter       → script.md
   🎨 storyboard-artist  → storyboard.json   ← xarajatdan oldin siz tasdiqlaysiz
   🎙️  voice-artist       → audio/*.mp3       (ElevenLabs)
   🎥 visual-generator   → clips/*.mp4       (Runway Gen-4)
   ✂️  editor             → final.mp4         (ffmpeg: montaj + subtitr + musiqa)
   🔍 qa-reviewer        → qa-report.md      → kerak bo'lsa sahnani qayta ishlashga qaytaradi
```

## O'rnatish

1. Kerakli dasturlar: **Node.js 18+**, **ffmpeg** va **Claude Code**.
2. API kalitlarni sozlang:
   ```bash
   cd video-office
   cp .env.example .env
   # .env faylini oching va RUNWAY_API_KEY hamda ELEVENLABS_API_KEY ni kiriting
   ```
   - Runway: https://dev.runwayml.com → API Keys (kredit sotib olinadi)
   - ElevenLabs: https://elevenlabs.io → Profile → API Keys

   Claude Code bulutda (claude.ai/code) ishlatilsa, kalitlarni `.env` o'rniga muhit sozlamalariga (environment variables) qo'shing.

## Ishlatish

Repozitoriy ildizida Claude Code'ni oching va yozing:

```
/make-video Toshkentdagi "Tong" qahvaxonasi uchun 25 soniyalik Instagram Reels reklama, o'zbek tilida
```

API kalitlarsiz, bepul sinab ko'rish uchun:

```
/make-video ... --mock
```

Producer xarajat talab qiladigan bosqichdan oldin sahnalar rejasini ko'rsatib, tasdiqingizni so'raydi.

## Qo'lda ishlatish (Claude'siz)

```bash
cd video-office
npm run demo                                            # namuna loyiha, mock rejimda
node pipeline.mjs projects/<loyiha>                     # to'liq ishlab chiqarish
node tools/gen-clip.mjs projects/<loyiha> --scene 2 --force   # faqat 2-sahnani qayta yaratish
node tools/assemble.mjs projects/<loyiha>               # faqat qayta montaj
```

## Loyiha tuzilishi

```
projects/<loyiha>/
├── brief.md          vazifa (Producer yozadi)
├── script.md         ssenariy
├── storyboard.json   sahnalar: narration, visual_prompt, motion_prompt, duration
├── music.mp3         ixtiyoriy fon musiqasi (o'zingiz qo'yasiz, masalan Suno'dan)
├── audio/  clips/  build/
├── final.mp4         ✅ tayyor video
└── qa-report.md
```

`storyboard.json` ning to'liq sxemasi: [`.claude/agents/storyboard-artist.md`](../.claude/agents/storyboard-artist.md).

## Xarajat (taxminiy)

| Xizmat | Narx |
|---|---|
| Runway kalit kadr (`gen4_image`) | ~$0.05–0.08 / rasm |
| Runway video (`gen4_turbo`) | ~$0.05 / soniya (5 s klip ≈ $0.25) |
| ElevenLabs | tarifga bog'liq, 30 s ovoz ≈ 400–500 belgi |

25 soniyalik, 5 sahnali video ≈ **$1.5–2**. Qayta yaratishlar alohida hisoblanadi. Narxlar o'zgarishi mumkin, xizmatlarning saytida tekshiring.

## Cheklovlar
- Runway klipi bir sahnada eng ko'pi bilan 10 soniya. Uzun ovozli sahnani ikkiga bo'ling.
- ElevenLabs'ning o'zbek tilidagi talaffuzini avval sinab ko'ring. Kerak bo'lsa, boshqa `ELEVENLABS_MODEL` yoki `voice_id` tanlang.
- Musiqa avtomatik yaratilmaydi: `music.mp3` ni loyiha papkasiga o'zingiz qo'ying.
