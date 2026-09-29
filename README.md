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

The deployable package in this standalone repository is already prepared;
`data/pairs.json` and `public/renders/` are committed. If the source study is
rebuilt, run the preparation script **from the original research repository**
that contains the private annotation files and STEP sources, in an environment
containing CadQuery, VTK, and Pillow:

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
remain in the private dataset. This standalone app cannot regenerate views
without that private research workspace.

## Deploy on Vercel

This repository is the app itself. If GitHub shows `package.json`, `api/`, and
`public/` at the top level, set the Vercel **Root Directory to the repository
root** (leave it unset, or keep `./` if Vercel displays that). An older
version of this guide named a parent-repository path; that path is incorrect
for this standalone repository.

1. In the already-connected Vercel project, open **Settings → Build and
   Deployment**. Set **Framework Preset** to **Other** and **Root Directory**
   to the repository root. The checked-in `vercel.json` supplies the build
   command (`node scripts/check-package.mjs`) and output directory (`public`). The
   root-level `api/` files become Node.js Vercel Functions.
2. Add a Postgres database, preferably Neon, via **Vercel Marketplace →
   Storage**, and connect it to this Vercel project. If the integration adds
   `DATABASE_URL`, use it. If it only adds a different URL variable, add
   `DATABASE_URL` in **Project → Settings → Environment Variables** with the
   pooled Postgres connection string. The app reads `DATABASE_URL` exactly.
   Vercel's former native Postgres product is replaced by Marketplace
   integrations ([Vercel Postgres guide](https://vercel.com/docs/postgres)).
3. Create the table before using the app: open the database's **Neon SQL
   Editor**, paste the contents of [`schema.sql`](schema.sql), and run it.
   The schema is safe to run again. Alternatively, run `npm run db:init` from
   this repository with `DATABASE_URL` set in your local environment.
4. In **Project → Settings → Environment Variables**, add four **different**
   random secrets named `RATER_A_TOKEN`, `RATER_B_TOKEN`,
   `ADJUDICATOR_TOKEN`, and `EXPORT_TOKEN`. Each must be at least 24 characters.
   Apply all five variables to **Production** and to **Preview** only if
   previews need real review access. Give each reviewer only their own code,
   privately. `.env.example` shows the required names, never usable values.
5. Push these changes to the branch configured as the Vercel production branch
   (currently `master` in this checkout), or use **Deployments → Redeploy**
   after changing settings. Check the deployment log for the message
   `Verified 6645 pairs and two views of 2643 blinded CAD assets.` Open the
   deployment URL: `/` should show the access page; `/api/session` without an
   access code should return `Invalid access code`. Enter a real reviewer code
   and confirm that a pair and both view angles load before inviting raters.

**Credential rotation required:** the committed `.env.example` contained usable
role access codes, and the local working copy also contained a database URL.
Replacing that file does not remove the old codes from Git history. Replace
**all four** access codes in Vercel with new unique random values, and rotate
the Neon database password as a precaution before using the deployment. Then
create a new deployment; environment changes apply only to new deployments
([Vercel environment variable guide](https://vercel.com/docs/environment-variables)).

Vercel deploys new commits automatically from a connected Git repository
([Git deployment guide](https://vercel.com/docs/git)). Run `npm test` and
`npm run check` before pushing. The build repeats the package check and rejects
missing or changed CAD images. The repository contains 5,287 rendered WebP
files (about 26 MB); keep them committed so the static CAD views are available.

The application needs a provisioned database and access tokens before it can
save real assessments. There is no local-file or browser-only fallback in
production, since those would not reliably preserve independent ratings.

The home page also offers **Skip login · Try guest review**. Guest review uses
12 sample comparisons and saves ratings only in that browser. It does not
write to Postgres or count toward the study. After rating all 12 pairs, a guest
can download a CSV copy. Formal reviewers still need their assigned access
code to save study ratings on the server.

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
`outputs/study/full/annotations/` in the original research repository, then
run there:

```powershell
python run.py --config configs/study_full_ft.yaml study-grade-finalize
python run.py --config configs/study_full_ft.yaml study-evaluate
```

The `run.py` finalizer belongs to that original research repository, not this
standalone deployment. It checks pair identities, completeness, disagreement
adjudication, coverage, and source-pool hashes. It writes `judged_pairs.csv`, provenance,
agreement statistics, and immutable metadata. Until that step succeeds, no
retrieval result should enter the manuscript.
