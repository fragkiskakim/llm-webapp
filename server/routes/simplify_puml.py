#!/usr/bin/env python3
"""
simplify_puml.py
Παίρνει ένα PlantUML αρχείο και παράγει simplified έκδοση:
  - Methods: "+ myMethod(int x) : void"  →  "+ myMethod()"
  - Fields:  "- myField : int"           →  "- myField"
  - Όλες οι άλλες γραμμές (namespace, class, relations, κλπ) μένουν ανέπαφες.

Χρήση:
  python3 simplify_puml.py input.puml
  python3 simplify_puml.py input.puml -o output.puml
"""

import re
import sys
import argparse
from pathlib import Path


def simplify_line(line: str) -> str:
    trimmed = line.strip()

    # Γραμμές που μένουν ανέπαφες
    passthrough_prefixes = (
        "namespace", "@", "class ", "interface ", "abstract ",
        "enum ", "}", "{", "'", "/'",
    )
    passthrough_contains = (
        "-->", "..>", "<|--", "*--", "o--", "<..", "..", "__",
    )

    if (
        not trimmed
        or any(trimmed.startswith(p) for p in passthrough_prefixes)
        or trimmed.endswith("'/")
        or any(s in trimmed for s in passthrough_contains)
        or re.match(r'^[A-Z][A-Za-z]*\.[A-Z]', trimmed)
    ):
        return line

    # Εξαγωγή visibility prefix (+, -, #, ~) και modifiers όπως {static}, {abstract}
    vis_match = re.match(r'^([+\-#~]?\s*(?:\{[^}]+\}\s*)*)', trimmed)
    visibility = vis_match.group(1) if vis_match else ""
    rest = trimmed[len(visibility):]

    # Method: έχει παρενθέσεις → κρατάμε μόνο όνομα + "()"
    method_match = re.match(r'^(\w+)\s*\(', rest)
    if method_match:
        simplified = f"{visibility}{method_match.group(1)}()"
        return line.replace(trimmed, simplified)

    # Field: κρατάμε μόνο το όνομα πριν το ":"
    field_match = re.match(r'^(\w+)', rest)
    if field_match:
        simplified = f"{visibility}{field_match.group(1)}"
        return line.replace(trimmed, simplified)

    return line


def simplify_puml(text: str) -> str:
    return "\n".join(simplify_line(line) for line in text.splitlines())


def main():
    ap = argparse.ArgumentParser(description="Simplify a PlantUML file (strip method params & field types).")
    ap.add_argument("input", help="Path to input .puml file")
    ap.add_argument("-o", "--output", help="Path to output .puml file (default: stdout)")
    args = ap.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    text = input_path.read_text(encoding="utf-8")
    simplified = simplify_puml(text)

    if args.output:
        Path(args.output).write_text(simplified, encoding="utf-8")
        print(f"✅ Saved to {args.output}")
    else:
        print(simplified)


if __name__ == "__main__":
    main()