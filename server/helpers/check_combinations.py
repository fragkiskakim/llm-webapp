#!/usr/bin/env python3
"""
check_combinations.py
Ελέγχει αν υπάρχουν όλοι οι απαραίτητοι συνδυασμοί με τουλάχιστον 5 runs.
Διαβάζει απευθείας από τη βάση μέσω DATABASE_URL από το .env

Χρήση:
  python3 check_combinations.py
  python3 check_combinations.py --env /path/to/.env
"""

import sys
import os
import argparse
from pathlib import Path

# ─── Load .env ────────────────────────────────────────────────────────────────

def load_env(env_path: Path):
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key   = key.strip()
        value = value.strip().strip('"').strip("'")
        if key not in os.environ:
            os.environ[key] = value

# ─── Ορισμός αναμενόμενων συνδυασμών ─────────────────────────────────────────

MODELS        = ["gpt4", "claude", "grok", "gemini", "mistral", "qwen", "deepseek"]
PROMPT_TYPES  = ["frnfr", "srs"]
TEMPERATURES  = ["0", "0.2", "0.5"]
DCC_ARCHS     = ["3tier", "mvc", "microservices", "client-server"]
MYCHARTS_ARCHS = ["3tier", "microservices"]

EXPECTED = []
for arch in DCC_ARCHS:
    for model in MODELS:
        for pt in PROMPT_TYPES:
            for temp in TEMPERATURES:
                EXPECTED.append(("DCC", arch, model, pt, temp))

for arch in MYCHARTS_ARCHS:
    for model in MODELS:
        for pt in PROMPT_TYPES:
            for temp in TEMPERATURES:
                EXPECTED.append(("MYCHARTS", arch, model, pt, temp))

# ─── Helpers ──────────────────────────────────────────────────────────────────

def norm_temp(t):
    f = float(t)
    return "0" if f == 0 else str(f)

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default=None, help="Path to .env file")
    args = ap.parse_args()

    # Βρες το .env
    if args.env:
        load_env(Path(args.env))
    else:
        for candidate in [
            Path(__file__).parent / ".env",
            Path(__file__).parent / "../.env",
            Path(__file__).parent / "../../server/.env",
        ]:
            if candidate.resolve().exists():
                load_env(candidate.resolve())
                print(f"📄 Loaded .env from {candidate.resolve()}")
                break

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL δεν βρέθηκε. Βεβαιώσου ότι υπάρχει στο .env")
        sys.exit(1)

    try:
        import psycopg2
    except ImportError:
        print("❌ Λείπει το psycopg2. Τρέξε: pip install psycopg2-binary")
        sys.exit(1)

    # Query — μετράμε μόνο rows με response (όχι failed runs)
    conn = psycopg2.connect(db_url)
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            SPLIT_PART(category, '_', 1) AS experiment,
            architecture,
            model,
            prompt_type,
            temperature,
            COUNT(*) AS runs
        FROM run_experiments
        WHERE response IS NOT NULL AND response != ''
        GROUP BY SPLIT_PART(category, '_', 1), architecture, model, prompt_type, temperature
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    # Build actual counts
    actual = {}
    for (exp, arch, model, pt, temp, runs) in rows:
        key = (exp.upper(), arch, model, pt, norm_temp(str(temp)))
        actual[key] = actual.get(key, 0) + int(runs)

    # Compare
    missing = []
    too_few = []
    extra   = []

    for combo in EXPECTED:
        exp, arch, model, pt, temp = combo
        key  = (exp, arch, model, pt, norm_temp(temp))
        runs = actual.get(key, 0)
        if runs == 0:
            missing.append((combo, runs))
        elif runs < 5:
            too_few.append((combo, runs))
        elif runs > 5:
            extra.append((combo, runs))

    # Report
    total = len(EXPECTED)
    ok    = total - len(missing) - len(too_few)

    print(f"\n{'='*55}")
    print(f"  Συνολικοί αναμενόμενοι συνδυασμοί : {total}")
    print(f"  ✅ Εντάξει (>= 5 runs)             : {ok}")
    print(f"  ❌ Εντελώς missing (0 runs)        : {len(missing)}")
    print(f"  ⚠️  Λιγότερα από 5 runs            : {len(too_few)}")
    print(f"  ℹ️  Περισσότερα από 5 runs          : {len(extra)}")
    print(f"{'='*55}\n")

    if missing:
        print("❌ MISSING (0 runs):")
        for (exp, arch, model, pt, temp), _ in missing:
            print(f"  {exp:10} | {arch:15} | {model:10} | {pt:6} | temp={temp}")

    if too_few:
        print(f"\n⚠️  ΛΙΓΟΤΕΡΑ ΑΠΟ 5 RUNS:")
        for (exp, arch, model, pt, temp), runs in too_few:
            print(f"  {exp:10} | {arch:15} | {model:10} | {pt:6} | temp={temp} → {runs} runs")

    if extra:
        print(f"\nℹ️  ΠΕΡΙΣΣΟΤΕΡΑ ΑΠΟ 5 RUNS:")
        for (exp, arch, model, pt, temp), runs in extra:
            print(f"  {exp:10} | {arch:15} | {model:10} | {pt:6} | temp={temp} → {runs} runs")

    if not missing and not too_few:
        print("🎉 Όλοι οι συνδυασμοί έχουν τουλάχιστον 5 runs!")


if __name__ == "__main__":
    main()
