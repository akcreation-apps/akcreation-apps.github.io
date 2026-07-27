import argparse
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXTS = {'.jpeg', '.jpg', '.png', '.webp'}


def square_crop(path: pathlib.Path, dry_run: bool = False) -> None:
    with Image.open(path) as im:
        w, h = im.size
        if w == h:
            print(f'skip (already square): {path.name} ({w}x{h})')
            return
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        if dry_run:
            print(f'would crop: {path.name} {w}x{h} -> {side}x{side}')
            return
        cropped = im.crop((left, top, left + side, top + side))
        fmt = im.format or ('JPEG' if path.suffix.lower() in {'.jpg', '.jpeg'} else path.suffix.lstrip('.').upper())
        save_kwargs = {'optimize': True} if fmt in {'JPEG', 'PNG'} else {}
        if fmt == 'JPEG':
            save_kwargs['quality'] = 92
        elif fmt == 'WEBP':
            save_kwargs['quality'] = 90
            save_kwargs['method'] = 6
        cropped.save(path, fmt, **save_kwargs)
    print(f'cropped: {path.name} {w}x{h} -> {side}x{side}')


def crop_folder(folder: pathlib.Path, dry_run: bool = False) -> None:
    if not folder.is_dir():
        print(f'not a directory: {folder}')
        return
    files = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in EXTS)
    if not files:
        print(f'no images found in {folder}')
        return
    for p in files:
        square_crop(p, dry_run=dry_run)


def main() -> None:
    ap = argparse.ArgumentParser(description='Center-crop every image in a folder to a square (skips already-square files).')
    ap.add_argument('folder', help='folder containing images (relative to repo root or absolute)')
    ap.add_argument('--dry-run', action='store_true', help='preview without writing')
    args = ap.parse_args()

    folder = pathlib.Path(args.folder)
    if not folder.is_absolute():
        folder = (ROOT / folder).resolve()
    crop_folder(folder, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
