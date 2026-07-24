# Restaurant Onboarding Tool

Local Flask app that scaffolds a new restaurant folder next to `/TCD/` by cloning it and rewriting the per-restaurant files.

## Run

```bash
cd onboarding-tool
pip install -r requirements.txt
flask --app app run
```

Then open http://127.0.0.1:5000 and complete the 3 steps:

1. Restaurant details → generates `restaurant.js`
2. Credentials → AES-encrypted (CryptoJS-compatible) `credentials.json`
3. Menu builder → `data.json`

On finish, a new folder `/<prefix>/` is created at the repo root with the logo, config, and HTML files pre-adjusted.
