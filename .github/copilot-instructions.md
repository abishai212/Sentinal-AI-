# AI engine guardrails

- Never use image filenames to classify or include them in prompts, except for the gated `DEMO_FILENAME_HINTS` offline fallback.
- All diagnosis results must pass through `normalizeDiagnosis()`; do not add a second output shape.
- `CATEGORIES` lives only in `backend/categories.js`.
- Never remove or reword the offline fallback templates without asking first.
- Missing confidence must never default above 40; offline confidence is capped at 85.
- Never display rejected/raw OCR text or expose error details or API keys to customers.
- Do only what is asked; list extra suggestions instead of implementing them.
- Before finishing any AI engine change, run `npm run verify` from `backend` and report its output.
