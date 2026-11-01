import argparse
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
FOOD_SRC = ROOT / 'food_src'


def convert(png_path: pathlib.Path, force: bool = False, dry_run: bool = False) -> None:
    webp_path = png_path.with_suffix('.webp')
    if webp_path.exists() and not force:
        print(f'skip (exists): {webp_path.name}')
        return
    if dry_run:
        print(f'would convert: {png_path.name} -> {webp_path.name}')
        return
    before = png_path.stat().st_size
    with Image.open(png_path) as im:
        im.save(webp_path, 'WEBP', quality=90, method=6)
    after = webp_path.stat().st_size
    png_path.unlink()
    print(f'converted: {png_path.name} -> {webp_path.name} ({before} -> {after} bytes)')


def main() -> None:
    ap = argparse.ArgumentParser(description='Convert every .png in food_src/ to .webp')
    ap.add_argument('--force', action='store_true', help='overwrite existing .webp')
    ap.add_argument('--dry-run', action='store_true', help='preview without writing')
    args = ap.parse_args()

    pngs = sorted(FOOD_SRC.glob('*.png'))
    if not pngs:
        print('no .png files in food_src/')
        return
    for p in pngs:
        convert(p, force=args.force, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
