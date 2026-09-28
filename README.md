# Blinded CAD expert review

This Vercel-compatible app collects the engineering-relevance grades required by
the existing retrieval evaluation. It uses the frozen 6,645 pairs in
`outputs/study/full/annotations/selected_pairs.csv` and the 0–3 rubric in
`protocol.json`. The public manifest contains opaque pair/sample IDs only;
source paths, class labels, model scores, and rankings remain outside the app.

## What the reviewer sees

Each pair has two actual STEP-derived CAD views for the query and candidate.
The interface displays the relevance rubric, an optional observation field,
saved progress, and the next unrated pair. Ratings are saved immediately to
Postgres. Revising a saved grade requires an explicit edit action. Database
versions prevent an older browser tab from silently overwriting a newer grade.
The rater can close the browser and resume with the same access code; the app
loads the stored annotations and returns to the next unrated pair. Independent
raters cannot see each other's scores. Once both independent rating files are
complete, their grades close to further edits and the adjudicator sees only
disagreements. The adjudication stage does not open before that point.

## Prepare the blinded package

Run from the repository root in an environment containing CadQuery, VTK, and
Pillow (the `laya-tmcad` environment in this workspace):

```powershell
python research_v2/expert_review_app/scripts/prepare_package.py --render --workers 8
```

This checks the SHA-256 of the frozen pair list against `protocol.json`, writes
`data/pairs.json`, and renders both views of all 2,643 selected STEP assets into
`public/renders/`. Re-running skips existing images. The script verifies both
views and records hashes of their STEP sources and WebP files in
`data/render_provenance.json`; no private paths or labels are copied into the
deployable manifest. `npm run check` rejects missing or changed views. The
rendering script is the reproducible source for the images; its CAD inputs
remain in the private dataset.

## Deploy on Vercel

1. Create a Vercel project with **Root Directory** set to
   `research_v2/expert_review_app`.
2. Attach a PostgreSQL provider such as Neon through the Vercel Marketplace.
   Vercel's current Postgres offering uses Marketplace integrations rather
   than the former native Vercel Postgres product
   ([Vercel documentation](https://vercel.com/docs/postgres)).
3. Set `DATABASE_URL` and four distinct random access tokens as shown in
   `.env.example`. Each token must have at least 24 characters. Share each
   expert's token privately; never place tokens in the repository.
4. Initialize the database with `npm run db:init` in an environment that has
   `DATABASE_URL` set. The idempotent schema is in `schema.sql`.
5. Install dependencies, run `npm test` and `npm run check`, then deploy. The
   configured Vercel build rejects missing CAD images. The app uses Node.js
   Vercel Functions in `api/` and static files in `public/`.

The application needs a provisioned database and access tokens before it can
save real assessments. There is no local-file or browser-only fallback in
production, since those would not reliably preserve independent ratings.

## Export and evaluate

When each independent rater has graded all pairs, download `rater_a.csv` and
`rater_b.csv`. Once both are complete, the adjudicator grades every
disagreement and exports `adjudication.csv`; agreement rows remain blank in
that file, as expected by the existing finalizer. An administrator token can
download all three files after the corresponding role is complete. Every
export uses the study's exact columns and frozen pair order:

```text
pair_id,query_asset,candidate_asset,grade,evidence
```

Before replacing the empty templates, save a backup of the original annotation
directory and validate each export with `scripts/validate_export.py --role
<rater_a|rater_b|adjudication> <file.csv>`. Place the three downloaded files in
`outputs/study/full/annotations/`, then run from the repository root:

```powershell
python run.py --config configs/study_full_ft.yaml study-grade-finalize
python run.py --config configs/study_full_ft.yaml study-evaluate
```

The finalizer checks pair identities, completeness, disagreement adjudication,
coverage, and source-pool hashes. It writes `judged_pairs.csv`, provenance,
agreement statistics, and immutable metadata. Until that step succeeds, no
retrieval result should enter the manuscript.
