"""
Add new product images and normalize them to the catalog spec.

Usage
-----
  1. Drop any raw images (.jpg / .jpeg / .png / .webp / .avif) into:
        images/_incoming/
  2. Run:
        python add_images.py
  3. Each file is resized to 500x500 (white letterbox, aspect preserved),
     converted to WebP, and moved to:
        images/products/<same base name>.webp
     The incoming file is deleted after successful conversion.
  4. Reference each image in data/products.json as:
        "image": "images/products/<name>.webp"

Notes
-----
  * The script never overwrites an existing image — rename the incoming file
    if you want to replace one.
  * If you pass a directory as an argument, images are read from there instead
    of images/_incoming/.
        python add_images.py C:/path/to/some/folder
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
DEST_DIR = ROOT / "images" / "products"
DEFAULT_IN = ROOT / "images" / "_incoming"

TARGET = 500
QUALITY = 82
BG = (255, 255, 255)      # white letterbox
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".bmp"}


def convert_one(src: Path) -> tuple[bool, str]:
    stem = src.stem
    dst = DEST_DIR / f"{stem}.webp"
    if dst.exists():
        return False, f"skip (exists): {dst.name}"
    try:
        with Image.open(src) as im:
            if im.mode == "P":
                im = im.convert("RGBA" if "transparency" in im.info else "RGB")
            im.thumbnail((TARGET, TARGET), Image.LANCZOS)
            canvas = Image.new("RGB", (TARGET, TARGET), BG)
            off = ((TARGET - im.width) // 2, (TARGET - im.height) // 2)
            if im.mode in ("RGBA", "LA"):
                canvas.paste(im.convert("RGB"), off, im.split()[-1])
            else:
                if im.mode != "RGB":
                    im = im.convert("RGB")
                canvas.paste(im, off)
            DEST_DIR.mkdir(parents=True, exist_ok=True)
            canvas.save(dst, "WEBP", quality=QUALITY, method=6)
        src.unlink()   # remove the source only after a successful save
        return True, f"ok:   {stem}.webp"
    except Exception as e:
        return False, f"FAIL: {src.name} — {e}"


def main():
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IN
    if not src_dir.exists():
        src_dir.mkdir(parents=True, exist_ok=True)
        print(f"Created {src_dir}. Drop new images there and re-run.")
        return

    files = sorted(p for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED)
    if not files:
        print(f"Nothing to do — no images in {src_dir}")
        return

    ok = fail = 0
    for f in files:
        succeeded, msg = convert_one(f)
        print(f"  {msg}")
        if succeeded: ok += 1
        else: fail += 1
    print(f"\ndone: {ok} converted, {fail} skipped/failed")


if __name__ == "__main__":
    main()
