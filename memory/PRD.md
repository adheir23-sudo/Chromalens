# ChromaLens AI — Product Requirements

## Original Problem Statement
Application that analyzes images or videos to reveal their technical details—such as recording device, bit depth, resolution, and megapixel count, as well as the editing software employed. Most importantly, provides the color grading formula used, serving as a reference for other users looking to deepen their knowledge of photography and editing.

## User Choices (confirmed)
- AI model: **Gemini 3.1 Pro** (`gemini-3.1-pro-preview` via emergentintegrations)
- Inputs: **Both images and videos** (JPG, PNG, WEBP, MP4, MOV)
- Formula output: **Both readable + technical numeric** (Lightroom slider values + DaVinci lift/gamma/gain/offset + HSL matrix + mood description)
- Storage: **Public gallery** — every analysis is saved and browsable
- Auth: **None** (open access)

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) + Motor/MongoDB.
  - `POST /api/analyze` — accepts image or video, runs Gemini 3.1 Pro (image via base64 ImageContent, video via FileContentWithMimeType), stores media in Emergent Object Storage, persists analysis JSON in Mongo.
  - `GET /api/gallery?media_type=&limit=&skip=` — reverse-chronological list.
  - `GET /api/analyses/{id}` — full record.
  - `GET /api/files/{id}` — proxied media bytes from object storage.
- **AI**: `/app/backend/analyzer.py` — strict JSON schema prompt for camera/lens/resolution/megapixels/bit depth/software + Lightroom + DaVinci Resolve + palette + mood.
- **Storage**: `/app/backend/storage.py` — Emergent Object Storage helper with force-reinit on 404.
- **Frontend**: React 19 + Tailwind + shadcn/ui + framer-motion + sonner + lucide-react.
  - Routes: `/` (Analyzer), `/gallery`, `/analysis/:id`, `/about`.
  - Design: darkroom control surface (`#0A0C10` base, amber `#F59E0B` + cyan `#06B6D4` accents, Outfit + Inter + JetBrains Mono).

## Implemented (2026-02)
- Full analyzer flow: drag/drop upload → AI analysis → technical panel + color grade panel.
- Interactive Lightroom sliders (13 params) and HSL matrix (8 colors × Hue/Sat/Lum).
- DaVinci Resolve 3-way color wheels (Lift/Gamma/Gain/Offset) rendered as SVG with vector points.
- Copy-to-clipboard for both Lightroom preset text and DaVinci recipe (Sonner toast confirmation).
- Public gallery grid with photo/video/all filter.
- Detail page for each analysis, deep-linkable.
- Verified end-to-end by testing agent (100% pass rate, iteration_1.json).

## Backlog (P1)
- Camera-brand and software filters in gallery.
- CUBE .LUT export of the DaVinci grade.
- User accounts + private saves.
- Batch upload.
- Compare mode (before/after applied grade preview).

## Notes
- `EMERGENT_LLM_KEY` in `/app/backend/.env` is used for both Gemini calls and Object Storage.
- Analysis is inference from pixels, not EXIF parsing — treat outputs as expert estimates.
