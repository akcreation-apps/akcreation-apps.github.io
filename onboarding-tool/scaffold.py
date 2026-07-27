"""Onboarding scaffold + existing-restaurant helpers.

Two flows:
1. CREATE — clone /TCD/ into a new /<prefix>/ folder and rewrite the per-restaurant files.
2. UPDATE — only rewrite /<prefix>/data.json for an already-existing restaurant.
"""

import json
import re
import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TCD_DIR = REPO_ROOT / "TCD"
REGISTRY_PATH = Path(__file__).resolve().parent / "registered.json"
_SELF_DIR_NAME = Path(__file__).resolve().parent.name


def _load_registry() -> list[str]:
    if not REGISTRY_PATH.exists():
        return []
    try:
        with REGISTRY_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [str(x) for x in data]
    except (json.JSONDecodeError, OSError):
        pass
    return []


def _save_registry(names: list[str]) -> None:
    with REGISTRY_PATH.open("w", encoding="utf-8") as f:
        json.dump(sorted(set(names)), f, indent=2)
        f.write("\n")


def add_to_registry(name: str) -> None:
    """Register a folder name as an 'existing restaurant' even if it lacks restaurant.js."""
    target = REPO_ROOT / name
    if not target.is_dir():
        raise FileNotFoundError(f"Folder does not exist: {name}")
    reg = _load_registry()
    if name not in reg:
        reg.append(name)
        _save_registry(reg)


def list_all_folders() -> list[str]:
    """All top-level folders in the repo — for the 'Add existing folder' picker."""
    out = []
    for p in REPO_ROOT.iterdir():
        if not p.is_dir():
            continue
        if p.name.startswith(".") or p.name.startswith("_"):
            continue
        if p.name == _SELF_DIR_NAME:
            continue
        out.append(p.name)
    return sorted(out)

CRED_KEYS = [
    "API_KEY",
    "AUTH_DOMAIN",
    "ID",
    "STORAGE_BUCKET",
    "MESSAGING_SENDER_ID",
    "APP_ID",
    "MEASUREMENT_ID",
    "DB_NAME",
    "ORDER_TABLE_NAME",
    "ADMIN_HISTORY_TABLE_NAME",
    "PASS_KEY",
]


def list_existing() -> list[str]:
    """Existing restaurants = any top-level folder that has data.json (or restaurant.js),
    plus any manually-registered folders."""
    auto = {
        p.name for p in REPO_ROOT.iterdir()
        if p.is_dir()
        and p.name != _SELF_DIR_NAME
        and not p.name.startswith((".", "_"))
        and ((p / "data.json").exists() or (p / "restaurant.js").exists())
    }
    registered = {n for n in _load_registry() if (REPO_ROOT / n).is_dir()}
    return sorted(auto | registered)


def load_menu(prefix: str) -> dict:
    path = REPO_ROOT / prefix / "data.json"
    if not path.exists():
        return {"menu": []}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_menu(prefix: str, menu_doc: dict) -> Path:
    path = REPO_ROOT / prefix / "data.json"
    if not path.parent.exists():
        raise FileNotFoundError(f"Restaurant folder not found: {path.parent}")
    with path.open("w", encoding="utf-8") as f:
        json.dump(menu_doc, f, indent=2)
        f.write("\n")
    return path


def restaurant_js(details: dict) -> str:
    enc_parts = [p.strip() for p in details["encKeyParts"]]
    enc_literal = "[" + ", ".join(f"'{p}'" for p in enc_parts) + "].join('-')"
    return (
        "const RESTAURANT = {\n"
        f"    name:           \"{details['name']}\",\n"
        f"    prefix:         \"{details['prefix']}\",\n"
        f"    encKey:         {enc_literal},\n"
        f"    logo:           \"{details['prefix']}-logo.png\",\n"
        f"    mapsUrl:        \"{details['mapsUrl']}\",\n"
        f"    wpFallback:     \"{details['wpFallback']}\",\n"
        f"    minOrder:       {int(details['minOrder'])},\n"
        f"    deliveryCharge: {int(details['deliveryCharge'])},\n"
        f"    etaMinutes:     {int(details['etaMinutes'])}\n"
        "};\n\n"
        "function lsKey(key) { return RESTAURANT.prefix + '_' + key; }\n"
    )


def _num_or_empty(v):
    """Return int/float when numeric, '' when blank. Matches TCD data.json convention."""
    if v is None or v == "":
        return ""
    try:
        n = float(v)
        return int(n) if n.is_integer() else n
    except (TypeError, ValueError):
        return ""


def build_menu(categories: list, starting_id: int = 101) -> dict:
    """Convert wizard payload → data.json shape.

    Rules:
    - name + price are mandatory (dish skipped otherwise).
    - id: use explicit value if provided; else fall back to running counter.
    - type on subcategory: only written when Veg/NonVeg was chosen.
    - offer_price / is_offer: only written when set.
    - available_time / not_available_time: numeric if provided, '' otherwise.
    """
    next_id = starting_id
    out_menu = []
    for cat in categories:
        subs = []
        for sub in cat.get("subcategories", []):
            dishes = []
            for d in sub.get("dishes", []):
                if not d.get("name") or d.get("price") in (None, ""):
                    continue

                dish_id = d.get("id")
                if dish_id in (None, ""):
                    dish_id = next_id
                    next_id += 1
                else:
                    dish_id = int(dish_id)
                    next_id = max(next_id, dish_id + 1)

                ordered = {
                    "id": dish_id,
                    "name": str(d["name"]).strip(),
                    "price": int(d["price"]),
                }
                if d.get("offer_price") not in (None, "", 0):
                    ordered["offer_price"] = int(d["offer_price"])
                if d.get("is_offer"):
                    ordered["is_offer"] = True
                ordered["available_time"] = _num_or_empty(d.get("available_time"))
                ordered["not_available_time"] = _num_or_empty(d.get("not_available_time"))
                days = d.get("non_available_days")
                if isinstance(days, list) and days:
                    cleaned = sorted({int(x) for x in days if str(x).strip() != "" and 0 <= int(x) <= 6})
                    if cleaned:
                        ordered["non_available_days"] = cleaned
                dishes.append(ordered)

            if dishes:
                sub_out = {"name": sub["name"].strip(), "dishes": dishes}
                stype = sub.get("type")
                if stype in ("Veg", "NonVeg"):
                    # Preserve TCD's key ordering: name, type, dishes.
                    sub_out = {"name": sub_out["name"], "type": stype, "dishes": dishes}
                subs.append(sub_out)

        if subs:
            out_menu.append({"category": cat["name"].strip(), "subcategories": subs})
    return {
        "_OFFER_KEYS_DOCS": [
            "To feature a dish in the top Deals of the Day rail, add TWO optional keys to that dish:",
            "  offer_price (number) — fake higher MRP; must be strictly greater than price. Renders strikethrough.",
            "  is_offer (boolean, true) — include this dish in the horizontal Deals rail at the top of the menu.",
        ],
        "menu": out_menu,
    }


def menu_to_categories(menu_doc: dict) -> list:
    """Flatten data.json back into the wizard's editable structure (preserves ids)."""
    out = []
    for cat in menu_doc.get("menu", []):
        subs = []
        for sub in cat.get("subcategories", []):
            dishes = []
            for d in sub.get("dishes", []):
                dishes.append({
                    "id": d.get("id"),
                    "name": d.get("name", ""),
                    "price": d.get("price", 0),
                    "offer_price": d.get("offer_price"),
                    "is_offer": bool(d.get("is_offer")),
                    "available_time": d.get("available_time", ""),
                    "not_available_time": d.get("not_available_time", ""),
                    "non_available_days": d.get("non_available_days", []) or [],
                })
            subs.append({"name": sub.get("name", ""), "type": sub.get("type", ""), "dishes": dishes})
        out.append({"name": cat.get("category", ""), "subcategories": subs})
    return out


def _replace_in_file(path: Path, replacements: list):
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    for old, new in replacements:
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


# Everything below is stripped from cloned HTML so a new restaurant carries
# zero SEO baggage from the source folder.
_SEO_STRIP_PATTERNS = [
    r"<!--\s*Primary SEO Meta Tags\s*-->",
    r"<!--\s*Open Graph[^>]*?-->",
    r"<!--\s*Twitter Card\s*-->",
    r"<!--\s*Schema\.org[^>]*?-->",
    r'<meta\s+name="description"[^>]*>',
    r'<meta\s+name="keywords"[^>]*>',
    r'<meta\s+name="robots"[^>]*>',
    r'<meta\s+name="author"[^>]*>',
    r'<link\s+rel="canonical"[^>]*>',
    r'<meta\s+property="og:[^"]*"[^>]*>',
    r'<meta\s+name="twitter:[^"]*"[^>]*>',
    r'<script\s+type="application/ld\+json">[\s\S]*?</script>',
    # Screen-reader-only SEO headings that seed keywords for search engines.
    r'<h1\s+class="sr-only"[^>]*>[\s\S]*?</h1>',
    r'<h2\s+class="sr-only"[^>]*>[\s\S]*?</h2>',
    # Long local-SEO tagline paragraph inside the local-info block.
    r'<p\s+class="local-info-tagline"[^>]*>[\s\S]*?</p>',
]


def _strip_seo(html: str, restaurant_name: str) -> str:
    for pat in _SEO_STRIP_PATTERNS:
        html = re.sub(pat, "", html, flags=re.IGNORECASE)
    # Replace <title>…</title> with just the restaurant name.
    html = re.sub(
        r"<title>[\s\S]*?</title>",
        f"<title>{restaurant_name}</title>",
        html,
        count=1,
        flags=re.IGNORECASE,
    )
    # Collapse runs of blank lines left behind.
    html = re.sub(r"[ \t]+\n", "\n", html)
    html = re.sub(r"\n{3,}", "\n\n", html)
    return html


def _strip_seo_in_file(path: Path, restaurant_name: str) -> None:
    if not path.exists():
        return
    path.write_text(_strip_seo(path.read_text(encoding="utf-8"), restaurant_name), encoding="utf-8")


def scaffold_new(details: dict, plain_creds: dict, categories: list, logo_bytes: bytes) -> Path:
    """CREATE flow: clone /TCD/ → /<prefix>/, write new files, do string replacements.

    Credentials are written as-is (plaintext) per current requirement.
    """
    prefix = details["prefix"].strip().lower()
    target = REPO_ROOT / prefix
    if target.exists():
        raise FileExistsError(f"Target folder already exists: {target}")

    shutil.copytree(TCD_DIR, target)

    for name in ("restaurant.js", "credentials.json", "data.json", "tcd-logo.png"):
        p = target / name
        if p.exists():
            p.unlink()
    admin_leftover = target / "admin" / "tcd_order_data.json"
    if admin_leftover.exists():
        admin_leftover.unlink()

    (target / "restaurant.js").write_text(restaurant_js(details), encoding="utf-8")

    # Plaintext credentials — user asked for no encrypt/decrypt.
    creds = {k: plain_creds.get(k, "") for k in CRED_KEYS}
    with (target / "credentials.json").open("w", encoding="utf-8") as f:
        json.dump(creds, f, indent=4)
        f.write("\n")

    with (target / "data.json").open("w", encoding="utf-8") as f:
        json.dump(build_menu(categories), f, indent=2)
        f.write("\n")

    (target / f"{prefix}-logo.png").write_bytes(logo_bytes)

    name = details["name"]
    logo_new = f"{prefix}-logo.png"

    # Strip all SEO tags/schema/canonical/OG/Twitter blocks from cloned HTML —
    # new restaurants start with zero source-restaurant SEO baggage.
    for html_path in (target / "index.html", target / "cart.html", target / "invoice.html",
                       target / "viewInvoice.html", target / "referral.html"):
        _strip_seo_in_file(html_path, name)

    # Preserve the two-tone logo look: first word in .brand-accent, remainder plain.
    parts = name.strip().split(None, 1)
    if len(parts) == 2:
        logo_span_replacement = f">{parts[0]}</span> {parts[1]}<"
    else:
        # Single-word names stay wrapped in the accent span so the accent colour still applies.
        logo_span_replacement = f">{name}</span><"

    common_replacements = [
        ("The Cafe Darbar", name),
        ("Cafe Darbar", name),
        ("tcd-logo.png", logo_new),
        ("/TCD/", f"/{prefix}/"),
        (">The Cafe</span> Darbar<", logo_span_replacement),
        ("(TCD)", ""),
        (" TCD ", f" {name} "),
        # cart.js hardcodes the source prefix in the order payload — retarget it.
        ("restaurant_id:   'TCD'", f"restaurant_id:   '{prefix.upper()}'"),
    ]
    for fname in ("index.html", "cart.html", "invoice.html", "viewInvoice.html", "referral.html", "cart.js"):
        _replace_in_file(target / fname, common_replacements)
    _replace_in_file(target / "admin" / "index.html", [("tcd-logo.png", logo_new)])

    return target
