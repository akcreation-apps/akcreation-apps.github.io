"""Restaurant onboarding / menu-update Flask app.

Phase 1: pick existing restaurant OR create new (collect details + logo).
Phase 2: credentials (new only; stored as plaintext).
Phase 3: menu builder — pre-loaded from data.json when editing an existing restaurant.
"""

import json
import os
import re
import secrets
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

import scaffold as scaffold_mod

app = Flask(__name__)
app.secret_key = os.environ.get("ONBOARDING_SECRET", secrets.token_hex(16))
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

_LOGO_STORE: dict[str, bytes] = {}
PREFIX_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,30}$")


def _sid() -> str:
    if "sid" not in session:
        session["sid"] = secrets.token_hex(8)
    return session["sid"]


@app.route("/")
def index():
    session.clear()
    return redirect(url_for("step1"))


@app.route("/register-existing", methods=["POST"])
def register_existing():
    folder = request.form.get("folder", "").strip()
    if folder:
        try:
            scaffold_mod.add_to_registry(folder)
        except FileNotFoundError:
            pass
    return redirect(url_for("step1"))


@app.route("/step1", methods=["GET", "POST"])
def step1():
    existing = scaffold_mod.list_existing()
    available = [n for n in scaffold_mod.list_all_folders() if n not in existing]

    if request.method == "POST":
        mode = request.form.get("mode")

        if mode == "existing":
            prefix = request.form.get("existing_prefix", "").strip()
            if prefix not in existing:
                return render_template("step1_restaurant.html", existing=existing, available=available, form=request.form, error="Pick an existing restaurant.")
            session["mode"] = "existing"
            session["prefix"] = prefix
            return redirect(url_for("step3"))

        # mode == "new"
        prefix = request.form["prefix"].strip().lower()
        if not PREFIX_RE.match(prefix):
            return render_template("step1_restaurant.html", existing=existing, available=available, form=request.form, error="Prefix must be lowercase letters/digits/hyphens (2-31 chars).")
        target = scaffold_mod.REPO_ROOT / prefix
        if target.exists():
            return render_template("step1_restaurant.html", existing=existing, available=available, form=request.form, error=f"Folder /{prefix}/ already exists — pick 'Update existing' instead.")

        logo_file = request.files.get("logo")
        if not logo_file or logo_file.filename == "":
            return render_template("step1_restaurant.html", existing=existing, available=available, form=request.form, error="Logo file is required for a new restaurant.")
        _LOGO_STORE[_sid()] = logo_file.read()

        enc_parts_raw = request.form.get("encKeyParts", "").strip()
        enc_parts = [p.strip() for p in enc_parts_raw.split(",") if p.strip()] if enc_parts_raw else [prefix.upper(), "FOOD", "CAFE"]

        order_data_filename = request.form.get("orderDataFilename", "").strip()
        if not order_data_filename.endswith(".json") or "/" in order_data_filename or "\\" in order_data_filename:
            return render_template("step1_restaurant.html", existing=existing, available=available, form=request.form, error="Order-data filename must be a plain filename ending in .json (e.g. tcd_order_data.json).")

        session["mode"] = "new"
        session["prefix"] = prefix
        session["details"] = {
            "name": request.form["name"].strip(),
            "prefix": prefix,
            "encKeyParts": enc_parts,
            "mapsUrl": request.form["mapsUrl"].strip(),
            "wpFallback": request.form["wpFallback"].strip(),
            "orderDataFilename": order_data_filename,
            "minOrder": int(request.form["minOrder"]),
            "deliveryCharge": int(request.form["deliveryCharge"]),
            "etaMinutes": int(request.form["etaMinutes"]),
        }
        return redirect(url_for("step2"))

    return render_template("step1_restaurant.html", existing=existing, available=available, form={}, error=None)


@app.route("/step2", methods=["GET", "POST"])
def step2():
    if session.get("mode") != "new":
        return redirect(url_for("step1"))
    if request.method == "POST":
        creds, missing = {}, []
        for key in scaffold_mod.CRED_KEYS:
            val = request.form.get(key, "").strip()
            if not val:
                missing.append(key)
            creds[key] = val
        if missing:
            return render_template("step2_credentials.html", keys=scaffold_mod.CRED_KEYS, form=request.form, error=f"Missing: {', '.join(missing)}")
        session["credentials"] = creds
        return redirect(url_for("step3"))
    return render_template("step2_credentials.html", keys=scaffold_mod.CRED_KEYS, form={}, error=None)


@app.route("/step3", methods=["GET"])
def step3():
    mode = session.get("mode")
    if mode not in ("new", "existing"):
        return redirect(url_for("step1"))
    if mode == "new" and "credentials" not in session:
        return redirect(url_for("step2"))

    preload = []
    if mode == "existing":
        menu_doc = scaffold_mod.load_menu(session["prefix"])
        preload = scaffold_mod.menu_to_categories(menu_doc)

    return render_template(
        "step3_menu.html",
        mode=mode,
        prefix=session["prefix"],
        preload_json=json.dumps(preload),
    )


@app.route("/finish", methods=["POST"])
def finish():
    mode = session.get("mode")
    if mode not in ("new", "existing"):
        return jsonify({"error": "session expired"}), 400

    payload = request.get_json(force=True)
    categories = payload.get("categories", [])
    if not categories:
        return jsonify({"error": "menu is empty"}), 400

    try:
        if mode == "new":
            logo_bytes = _LOGO_STORE.get(_sid())
            if not logo_bytes:
                return jsonify({"error": "logo missing from session"}), 400
            target = scaffold_mod.scaffold_new(
                session["details"], session["credentials"], categories, logo_bytes
            )
            session["done_path"] = str(target)
            _LOGO_STORE.pop(_sid(), None)
        else:
            menu_doc = scaffold_mod.build_menu(categories)
            path = scaffold_mod.save_menu(session["prefix"], menu_doc)
            session["done_path"] = str(path)
    except FileExistsError as e:
        return jsonify({"error": str(e)}), 409
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404

    session["done_prefix"] = session["prefix"]
    session["done_mode"] = mode
    return jsonify({"redirect": url_for("done")})


@app.route("/done")
def done():
    if "done_path" not in session:
        return redirect(url_for("step1"))
    return render_template(
        "done.html",
        path=session["done_path"],
        prefix=session["done_prefix"],
        mode=session["done_mode"],
    )


if __name__ == "__main__":
    app.run(debug=True)
