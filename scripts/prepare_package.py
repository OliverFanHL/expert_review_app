"""Freeze the blinded review manifest and render the selected STEP assets.

The public package contains opaque IDs and CAD images only; source classes and
relative paths remain in the private study annotation directory.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
RESEARCH = APP.parent
REPO = RESEARCH.parent
ANNOTATIONS = REPO / "outputs/study/full/annotations"
sys.path.insert(0, str(RESEARCH / "scripts"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def prepare_manifest() -> tuple[dict, dict[str, str]]:
    protocol = json.loads((ANNOTATIONS / "protocol.json").read_text(encoding="utf-8"))
    source = ANNOTATIONS / "selected_pairs.csv"
    if sha256(source) != protocol["selected_pairs_sha256"]:
        raise ValueError("Selected pair list no longer matches the frozen protocol")
    with source.open(newline="", encoding="utf-8-sig") as stream:
        selected = list(csv.DictReader(stream))
    with (ANNOTATIONS / "private_asset_manifest.csv").open(newline="", encoding="utf-8-sig") as stream:
        private = list(csv.DictReader(stream))
    if len(selected) != protocol["n_pairs"] or len(private) != protocol["n_assets"]:
        raise ValueError("Selected pair or asset counts changed")
    paths = {row["sample_id"]: row["absolute_path"] for row in private}
    pairs = [{"pair_id": r["pair_id"], "split": r["split"],
              "query_id": r["query_id"], "candidate_id": r["candidate_id"]}
             for r in selected]
    if len({p["pair_id"] for p in pairs}) != len(pairs):
        raise ValueError("Duplicate pair ID")
    if set(paths) != {id for p in pairs for id in (p["query_id"], p["candidate_id"])}:
        raise ValueError("Private asset manifest does not cover exactly the selected pairs")
    manifest = {"protocol_hash": protocol["selected_pairs_sha256"],
                "rubric": protocol["rubric"], "pairs": pairs,
                "asset_ids": sorted(paths)}
    destination = APP / "data/pairs.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(manifest, separators=(",", ":")), encoding="utf-8")
    return manifest, paths


def render_one(item: tuple[str, str]) -> tuple[str, str | None]:
    sample_id, source = item
    variants = [("", (.95, -.80, .70)), ("_B", (-.85, -.90, .95))]
    try:
        from PIL import Image, ImageChops
        from render_step_candidates import load_poly, render

        pending = [(suffix, direction) for suffix, direction in variants
                   if not (APP / "public/renders" / f"{sample_id}{suffix}.webp").exists()]
        if not pending:
            return sample_id, None
        # Web previews are smaller than paper figures. A coarser tessellation
        # bounds memory for intricate gears and springs without changing the STEP.
        shape, center, extent = load_poly(Path(source), tolerance_fraction=.03)
        for suffix, direction in pending:
            output = APP / "public/renders" / f"{sample_id}{suffix}.webp"
            temp = output.with_suffix(".png")
            try:
                render(shape, center, extent, direction, temp)
                with Image.open(temp) as raw:
                    image = raw.convert("RGB")
                    diff = ImageChops.difference(image, Image.new("RGB", image.size, "white"))
                    box = diff.point(lambda v: 255 if v > 10 else 0).getbbox()
                    if box is None:
                        raise ValueError("blank rendering")
                    image = image.crop(box)
                    image.thumbnail((440, 360), Image.Resampling.LANCZOS)
                    canvas = Image.new("RGB", (480, 390), "white")
                    canvas.paste(image, ((480 - image.width)//2, (390 - image.height)//2))
                    canvas.save(output, "WEBP", quality=83, method=4)
            finally:
                temp.unlink(missing_ok=True)
        return sample_id, None
    except Exception as exc:  # preserve other successful renders for reruns
        return sample_id, f"{type(exc).__name__}: {exc}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--render", action="store_true", help="Render all blinded CAD assets")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int, default=0, help="Development smoke check only")
    args = parser.parse_args()
    manifest, paths = prepare_manifest()
    print(f"Frozen manifest: {len(manifest['pairs'])} pairs, {len(paths)} assets", flush=True)
    if not args.render:
        return
    (APP / "public/renders").mkdir(parents=True, exist_ok=True)
    work = [(id, paths[id]) for id in manifest["asset_ids"]]
    if args.limit:
        work = work[:args.limit]
    failures = []
    with ProcessPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(render_one, item) for item in work]
        for number, future in enumerate(as_completed(futures), 1):
            sample_id, error = future.result()
            if error:
                failures.append({"sample_id": sample_id, "error": error})
            if number % 100 == 0 or number == len(work):
                print(f"Rendered/checked {number}/{len(work)}; failures {len(failures)}", flush=True)
    if failures:
        failure_file = APP / "render_failures.json"
        failure_file.write_text(json.dumps(failures, indent=2), encoding="utf-8")
        raise SystemExit(f"{len(failures)} CAD assets failed; details: {failure_file}")
    if args.limit:
        return
    from PIL import Image
    provenance = {"protocol_hash": manifest["protocol_hash"],
                  "render_style": "satin-metallic; two fixed oblique cameras; 480x390 WebP",
                  "assets": {}}
    for sample_id in manifest["asset_ids"]:
        views = [APP / "public/renders" / f"{sample_id}{suffix}.webp" for suffix in ("", "_B")]
        for view in views:
            with Image.open(view) as image:
                image.verify()
        provenance["assets"][sample_id] = {
            "step_sha256": sha256(Path(paths[sample_id])),
            "view_a_sha256": sha256(views[0]),
            "view_b_sha256": sha256(views[1]),
        }
    (APP / "data/render_provenance.json").write_text(
        json.dumps(provenance, separators=(",", ":")), encoding="utf-8")
    print("Verified and hashed every STEP source and both rendered views", flush=True)


if __name__ == "__main__":
    main()
