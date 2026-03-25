#!/usr/bin/env python3
"""
Extracts a class-level dependency graph from a C++ translation unit.

Output JSON:
{
  "nodes": [
    {
      "id": "Model::Foo",
      "kind": "class|struct|interface",
      "owner_namespace": "Model",
      "is_abstract": false,
      "is_template": false
    }, ...
  ],
  "edges": [
    {"src": "Model::Foo", "dst": "Model::Bar", "type": "INHERIT|IMPLEMENTS|COMPOSE|CALL|USE_TYPE"},
    ...
  ],
  "scope": "single_translation_unit"
}

Edge types:
  INHERIT     — class B : public A          (non-pure-virtual base)
  IMPLEMENTS  — class B : public IFoo       (base has at least one pure virtual method)
  COMPOSE     — field of type T             (ownership / aggregation)
  CALL        — method body calls method of another class
  USE_TYPE    — parameter type, return type, or template argument (no ownership)


  HOW TO RUN:
  python analyze_cpp_classes_to_graph.py myfile.cpp     --flag=-std=c++17     --flag=-I/path/to/includes     --ignore-std
"""

import sys, json, argparse, os, platform, shutil
from collections import defaultdict
from pathlib import Path


# ---------------------------------------------------------------------------
# Windows: libclang configuration (same as original)
# ---------------------------------------------------------------------------
def configure_libclang_windows():
    from clang import cindex
    lib_file = os.environ.get("LIBCLANG_FILE")
    if lib_file and Path(lib_file).exists():
        cindex.Config.set_library_file(str(Path(lib_file)))
        return True
    lib_dir = os.environ.get("LIBCLANG_PATH")
    if lib_dir and Path(lib_dir).is_dir():
        cand = Path(lib_dir) / "libclang.dll"
        if cand.exists():
            cindex.Config.set_library_file(str(cand))
            return True
    candidates = [
        Path(r"C:\Program Files\LLVM\bin\libclang.dll"),
        Path(r"C:\Program Files (x86)\LLVM\bin\libclang.dll"),
        Path.home() / r"scoop\apps\llvm\current\bin\libclang.dll",
        Path(r"C:\LLVM\bin\libclang.dll"),
    ]
    for cand in candidates:
        if cand.exists():
            cindex.Config.set_library_file(str(cand))
            return True
    clang_exe = shutil.which("clang")
    if clang_exe:
        cand = Path(clang_exe).resolve().parent / "libclang.dll"
        if cand.exists():
            cindex.Config.set_library_file(str(cand))
            return True
    return False


try:
    from clang import cindex
    from clang.cindex import TypeKind, CursorKind
except ModuleNotFoundError:
    print(json.dumps({"error": "python package 'clang' not installed"}), file=sys.stderr)
    sys.exit(2)

if platform.system().lower().startswith("win"):
    if not configure_libclang_windows():
        print(json.dumps({"error": "libclang.dll not found"}), file=sys.stderr)
        sys.exit(3)


# ---------------------------------------------------------------------------
# Helpers (adapted from original)
# ---------------------------------------------------------------------------

def is_from_system_header(cursor) -> bool:
    """True if the cursor is defined in a system header file."""
    loc = cursor.location
    if loc is None or loc.file is None:
        return True  # no location = compiler builtin, skip
    filepath = str(loc.file.name)
    # System headers are under /usr/include, /usr/lib, compiler internals, etc.
    system_prefixes = ("/usr/include", "/usr/lib", "/usr/local/include")
    return any(filepath.startswith(p) for p in system_prefixes)


def ns_of_decl(decl):
    """Full namespace path of a declaration cursor, e.g. 'Model::Detail'."""
    parts = []
    d = decl
    while d is not None:
        if d.kind == CursorKind.NAMESPACE:
            parts.append(d.spelling)
        d = d.semantic_parent
    parts.reverse()
    return "::".join(p for p in parts if p)


def fqn_of_cursor(cursor):
    """
    Fully-qualified name of a class/struct cursor.
    Walks semantic parents collecting NAMESPACE and CLASS/STRUCT names.
    e.g. namespace A { class B { class C {}; }; }  ->  "A::B::C"
    """
    parts = []
    c = cursor
    while c is not None:
        if c.kind in (CursorKind.NAMESPACE,
                      CursorKind.CLASS_DECL,
                      CursorKind.STRUCT_DECL,
                      CursorKind.CLASS_TEMPLATE):
            if c.spelling:
                parts.append(c.spelling)
        c = c.semantic_parent
    parts.reverse()
    return "::".join(parts)


def owner_namespace_of(cursor):
    """Namespace string for a class cursor (same logic as original)."""
    c = cursor
    while c is not None:
        if c.kind == CursorKind.NAMESPACE:
            return ns_of_decl(c)
        c = getattr(c, "lexical_parent", None)
    c = cursor
    while c is not None:
        if c.kind == CursorKind.NAMESPACE:
            return ns_of_decl(c)
        c = getattr(c, "semantic_parent", None)
    return ""


def is_internal_ns(ns: str) -> bool:
    if not ns:
        return False
    return ns.split("::", 1)[0].startswith("__")


def is_abstract_record(record_cursor) -> bool:
    for c in record_cursor.get_children():
        if c.kind == CursorKind.CXX_METHOD:
            try:
                if c.is_pure_virtual_method():
                    return True
            except Exception:
                pass
    return False


def is_template_record(record_cursor) -> bool:
    return record_cursor.kind == CursorKind.CLASS_TEMPLATE


def walk(cursor):
    yield cursor
    for ch in cursor.get_children():
        yield from walk(ch)


def fqn_from_type(t, known_fqns: set) -> str | None:
    """
    Given a clang Type, return the FQN of the referenced class if it is
    a known class in our graph. Returns None otherwise.
    """
    if t is None:
        return None
    try:
        t = t.get_canonical()
    except Exception:
        return None
    # peel pointers / references
    try:
        while t.kind in (TypeKind.POINTER, TypeKind.LVALUEREFERENCE, TypeKind.RVALUEREFERENCE):
            t = t.get_pointee().get_canonical()
    except Exception:
        pass
    try:
        decl = t.get_declaration()
        if decl is not None and decl.kind != CursorKind.NO_DECL_FOUND:
            fqn = fqn_of_cursor(decl)
            if fqn in known_fqns:
                return fqn
    except Exception:
        pass
    return None


def fqns_from_type_recursive(t, known_fqns: set) -> set:
    """
    Collect all FQNs referenced by a type, including template arguments.
    Used for USE_TYPE edges (parameters, return types, template args).
    """
    out = set()
    if t is None:
        return out
    direct = fqn_from_type(t, known_fqns)
    if direct:
        out.add(direct)
    # template arguments
    try:
        tc = t.get_canonical()
        n = tc.get_num_template_arguments()
        if n and n > 0:
            for i in range(n):
                try:
                    arg_t = tc.get_template_argument_type(i)
                    out |= fqns_from_type_recursive(arg_t, known_fqns)
                except Exception:
                    pass
    except Exception:
        pass
    return out


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

def extract_graph(path: str, flags: list[str], ignore_std: bool) -> dict:

    index = cindex.Index.create()
    tu = index.parse(
        path,
        args=flags,
        options=cindex.TranslationUnit.PARSE_DETAILED_PROCESSING_RECORD,
    )

    # ------------------------------------------------------------------ #
    # Pass 1: collect all class/struct nodes                               #
    # ------------------------------------------------------------------ #
    # Maps FQN -> node dict
    nodes: dict[str, dict] = {}

    for cur in walk(tu.cursor):
        if cur.kind not in (CursorKind.CLASS_DECL,
                            CursorKind.STRUCT_DECL,
                            CursorKind.CLASS_TEMPLATE):
            continue
        if not cur.is_definition():
            continue

        fqn = fqn_of_cursor(cur)
        if not fqn:
            continue

        ns = owner_namespace_of(cur)
        if is_internal_ns(ns):
            continue
        # Μετά το is_internal_ns check:
        if is_from_system_header(cur):
            continue

        # Επίσης φιλτράρισε nodes χωρίς namespace αν θες μόνο user-defined classes:
        if not ns:
            continue
        if ignore_std and (ns == "std" or ns.startswith("std::")):
            continue

        abstract = is_abstract_record(cur)
        template = is_template_record(cur)
        kind = "interface" if abstract else ("class" if cur.kind in (CursorKind.CLASS_DECL, CursorKind.CLASS_TEMPLATE) else "struct")

        nodes[fqn] = {
            "id": fqn,
            "kind": kind,
            "owner_namespace": ns,
            "is_abstract": abstract,
            "is_template": template,
        }

    known_fqns = set(nodes.keys())

    # ------------------------------------------------------------------ #
    # Pass 2: extract edges                                                #
    # ------------------------------------------------------------------ #
    # Use a set to avoid duplicate edges (collapsed multigraph)
    edge_set: set[tuple] = set()   # (src, dst, type)

    def add_edge(src: str, dst: str, etype: str):
        if src and dst and src != dst and src in known_fqns and dst in known_fqns:
            edge_set.add((src, dst, etype))

    for cur in walk(tu.cursor):

        # --- INHERIT / IMPLEMENTS ---
        if cur.kind == CursorKind.CXX_BASE_SPECIFIER:
            child_cursor = cur.semantic_parent  # the class that inherits
            if child_cursor is None:
                child_cursor = cur.lexical_parent
            if child_cursor is None:
                continue
            child_fqn = fqn_of_cursor(child_cursor)

            ref = cur.referenced
            if ref is None:
                ref = cur.get_definition()
            if ref is None:
                continue
            base_fqn = fqn_of_cursor(ref)

            if not child_fqn or not base_fqn:
                continue

            # Determine edge type: IMPLEMENTS if the base is abstract (interface)
            base_node = nodes.get(base_fqn)
            if base_node and base_node["is_abstract"]:
                add_edge(child_fqn, base_fqn, "IMPLEMENTS")
            else:
                add_edge(child_fqn, base_fqn, "INHERIT")

        # --- COMPOSE (field declarations) ---
        if cur.kind == CursorKind.FIELD_DECL:
            owner = cur.semantic_parent
            if owner is None:
                continue
            owner_fqn = fqn_of_cursor(owner)
            field_fqn = fqn_from_type(cur.type, known_fqns)
            if field_fqn:
                add_edge(owner_fqn, field_fqn, "COMPOSE")
            # Also catch template args in field type (e.g. vector<Bar>)
            for fqn in fqns_from_type_recursive(cur.type, known_fqns):
                if fqn != field_fqn:
                    add_edge(owner_fqn, fqn, "USE_TYPE")

        # --- CALL (method bodies) ---
        if cur.kind == CursorKind.CALL_EXPR:
            ref = cur.referenced
            if ref is None:
                continue
            # Class that owns the called method
            callee_class = ref.semantic_parent
            if callee_class is None:
                continue
            callee_fqn = fqn_of_cursor(callee_class)

            # Walk up from the call site to find the enclosing class
            caller_fqn = None
            p = cur.semantic_parent
            while p is not None:
                if p.kind in (CursorKind.CLASS_DECL,
                              CursorKind.STRUCT_DECL,
                              CursorKind.CLASS_TEMPLATE):
                    caller_fqn = fqn_of_cursor(p)
                    break
                p = p.semantic_parent

            if caller_fqn:
                add_edge(caller_fqn, callee_fqn, "CALL")

        # --- USE_TYPE (parameters and return types) ---
        if cur.kind in (CursorKind.PARM_DECL,
                        CursorKind.CXX_METHOD,
                        CursorKind.FUNCTION_DECL,
                        CursorKind.CONSTRUCTOR):

            # Attribute to the owning class
            owner = cur.semantic_parent
            if owner is None:
                continue
            if cur.kind == CursorKind.PARM_DECL:
                # parameter -> owner is the method -> owner is the class
                owner = owner.semantic_parent
                if owner is None:
                    continue
            owner_fqn = fqn_of_cursor(owner)
            if owner_fqn not in known_fqns:
                continue

            # Parameter type
            for fqn in fqns_from_type_recursive(cur.type, known_fqns):
                add_edge(owner_fqn, fqn, "USE_TYPE")

            # Return type (methods/functions)
            if hasattr(cur, "result_type"):
                try:
                    for fqn in fqns_from_type_recursive(cur.result_type, known_fqns):
                        add_edge(owner_fqn, fqn, "USE_TYPE")
                except Exception:
                    pass

    # ------------------------------------------------------------------ #
    # Build output                                                         #
    # ------------------------------------------------------------------ #
    edges = [{"src": s, "dst": d, "type": t} for s, d, t in sorted(edge_set)]

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "scope": "single_translation_unit",
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Extract class dependency graph from C++ source.")
    ap.add_argument("path", help="Path to .cpp / .h file")
    ap.add_argument("--flag", action="append", default=[], metavar="FLAG",
                    help="Clang compile flag (repeatable, e.g. --flag=-std=c++17)")
    ap.add_argument("--ignore-std", action="store_true",
                    help="Exclude std:: namespace classes from the graph")
    args = ap.parse_args()

    result = extract_graph(args.path, args.flag, args.ignore_std)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()