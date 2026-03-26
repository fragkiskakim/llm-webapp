#!/usr/bin/env python3
"""
analyze_cpp_hybrid_graph.py

Extracts a HYBRID graph from a C++ translation unit:

  Node types:
    - class/struct/interface  (same as before)
    - method                  (NEW: CXX_METHOD, CONSTRUCTOR, DESTRUCTOR)

  Edge types:
    Class → Class   : INHERIT, IMPLEMENTS, COMPOSE, USE_TYPE  (structural)
    Class → Method  : DEFINES                                  (NEW)
    Method → Method : CALLS                                    (NEW, replaces class-level CALL)

Output JSON:
{
  "nodes": [
    {
      "id": "Client::Foo",
      "node_type": "class",
      "kind": "class|struct|interface",
      "owner_namespace": "Client",
      "is_abstract": false,
      "is_template": false
    },
    {
      "id": "Client::Foo::bar(int)",
      "node_type": "method",
      "owner_class": "Client::Foo",
      "owner_namespace": "Client",
      "is_virtual": false,
      "is_static": false,
      "is_constructor": false,
      "is_destructor": false
    },
    ...
  ],
  "edges": [
    {"src": "Client::Foo", "dst": "Client::Bar",        "type": "INHERIT"},
    {"src": "Client::Foo", "dst": "Client::Foo::bar(int)", "type": "DEFINES"},
    {"src": "Client::Foo::bar(int)", "dst": "Client::Bar::baz()", "type": "CALLS"},
    ...
  ],
  "scope": "single_translation_unit"
}

HOW TO RUN:
  python analyze_cpp_hybrid_graph.py myfile.cpp \\
      --flag=-std=c++17 \\
      --flag=-I/path/to/includes \\
      --ignore-std
"""

import sys, json, argparse, os, platform, shutil
from pathlib import Path

# ---------------------------------------------------------------------------
# Windows: libclang configuration
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
# Helpers
# ---------------------------------------------------------------------------

def is_from_system_header(cursor) -> bool:
    loc = cursor.location
    if loc is None or loc.file is None:
        return True
    filepath = str(loc.file.name)
    system_prefixes = ("/usr/include", "/usr/lib", "/usr/local/include")
    return any(filepath.startswith(p) for p in system_prefixes)


def ns_of_decl(decl):
    parts = []
    d = decl
    while d is not None:
        if d.kind == CursorKind.NAMESPACE:
            parts.append(d.spelling)
        d = d.semantic_parent
    parts.reverse()
    return "::".join(p for p in parts if p)


def fqn_of_cursor(cursor):
    """Fully-qualified name, e.g. 'A::B::C'."""
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


def method_signature(cursor) -> str:
    """
    Build a method id: 'OwnerClass::methodName(Type1, Type2)'.
    Uses canonical parameter types so overloads are distinct.
    """
    owner_fqn = fqn_of_cursor(cursor.semantic_parent) if cursor.semantic_parent else ""
    name = cursor.spelling

    param_types = []
    for child in cursor.get_children():
        if child.kind == CursorKind.PARM_DECL:
            try:
                # Use canonical spelling for consistent overload disambiguation
                param_types.append(child.type.get_canonical().spelling)
            except Exception:
                param_types.append("?")

    sig = f"{name}({', '.join(param_types)})"
    return f"{owner_fqn}::{sig}" if owner_fqn else sig


def owner_namespace_of(cursor):
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


def fqn_from_type(t, known_fqns: set):
    if t is None:
        return None
    try:
        t = t.get_canonical()
    except Exception:
        return None
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
    out = set()
    if t is None:
        return out
    direct = fqn_from_type(t, known_fqns)
    if direct:
        out.add(direct)
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

def extract_graph(path: str, flags: list, ignore_std: bool) -> dict:

    index = cindex.Index.create()
    tu = index.parse(
        path,
        args=flags,
        options=cindex.TranslationUnit.PARSE_DETAILED_PROCESSING_RECORD,
    )

    # ------------------------------------------------------------------ #
    # Pass 1a: collect CLASS nodes                                         #
    # ------------------------------------------------------------------ #
    class_nodes: dict[str, dict] = {}

    for cur in walk(tu.cursor):
        if cur.kind not in (CursorKind.CLASS_DECL,
                            CursorKind.STRUCT_DECL,
                            CursorKind.CLASS_TEMPLATE):
            continue
        if not cur.is_definition():
            continue
        if is_from_system_header(cur):
            continue

        fqn = fqn_of_cursor(cur)
        if not fqn:
            continue

        ns = owner_namespace_of(cur)
        if is_internal_ns(ns) or not ns:
            continue
        if ignore_std and (ns == "std" or ns.startswith("std::")):
            continue

        abstract = is_abstract_record(cur)
        template = is_template_record(cur)
        kind = ("interface" if abstract
                else "class" if cur.kind in (CursorKind.CLASS_DECL, CursorKind.CLASS_TEMPLATE)
                else "struct")

        class_nodes[fqn] = {
            "id": fqn,
            "node_type": "class",
            "kind": kind,
            "owner_namespace": ns,
            "is_abstract": abstract,
            "is_template": template,
        }

    known_class_fqns = set(class_nodes.keys())

    # ------------------------------------------------------------------ #
    # Pass 1b: collect METHOD nodes                                        #
    # ------------------------------------------------------------------ #
    method_nodes: dict[str, dict] = {}

    METHOD_KINDS = (CursorKind.CXX_METHOD,
                    CursorKind.CONSTRUCTOR,
                    CursorKind.DESTRUCTOR)

    seen_method_sigs: set[str] = set()  # deduplicate decl vs definition

    for cur in walk(tu.cursor):
        if cur.kind not in METHOD_KINDS:
            continue
        # Accept declarations too (handles .h-only files).
        # If both declaration and definition exist, the definition wins
        # because walk() will visit it too and overwrite with richer info.
        if is_from_system_header(cur):
            continue

        owner = cur.semantic_parent
        if owner is None:
            continue
        owner_fqn = fqn_of_cursor(owner)
        if owner_fqn not in known_class_fqns:
            continue

        sig = method_signature(cur)
        # If we already have the definition, skip a later declaration
        if sig in seen_method_sigs and not cur.is_definition():
            continue
        seen_method_sigs.add(sig)
        ns = owner_namespace_of(cur)

        # return type (None for constructors/destructors)
        if cur.kind in (CursorKind.CONSTRUCTOR, CursorKind.DESTRUCTOR):
            return_type = None
        else:
            try:
                return_type = cur.result_type.spelling
            except Exception:
                return_type = None

        # parameters: list of {name, type, type_canonical}
        parameters = []
        for child in cur.get_children():
            if child.kind == CursorKind.PARM_DECL:
                try:
                    parameters.append({
                        "name": child.spelling or "",
                        "type": child.type.spelling,
                        "type_canonical": child.type.get_canonical().spelling,
                    })
                except Exception:
                    parameters.append({"name": child.spelling or "", "type": "?", "type_canonical": "?"})

        method_nodes[sig] = {
            "id": sig,
            "node_type": "method",
            "owner_class": owner_fqn,
            "owner_namespace": ns,
            "is_virtual": cur.is_virtual_method() if cur.kind == CursorKind.CXX_METHOD else False,
            "is_static": cur.is_static_method() if cur.kind == CursorKind.CXX_METHOD else False,
            "is_constructor": cur.kind == CursorKind.CONSTRUCTOR,
            "is_destructor": cur.kind == CursorKind.DESTRUCTOR,
            "return_type": return_type,
            "parameters": parameters,
        }

    known_method_ids = set(method_nodes.keys())
    all_known = known_class_fqns | known_method_ids

    # ------------------------------------------------------------------ #
    # Pass 2: extract edges                                                #
    # ------------------------------------------------------------------ #
    edge_set: set[tuple] = set()

    def add_edge(src: str, dst: str, etype: str):
        if src and dst and src != dst and src in all_known and dst in all_known:
            edge_set.add((src, dst, etype))

    # --- DEFINES: Class → Method ---
    for sig, m in method_nodes.items():
        add_edge(m["owner_class"], sig, "DEFINES")

    for cur in walk(tu.cursor):

        # --- INHERIT / IMPLEMENTS: Class → Class ---
        if cur.kind == CursorKind.CXX_BASE_SPECIFIER:
            child_cursor = cur.semantic_parent or cur.lexical_parent
            if child_cursor is None:
                continue
            child_fqn = fqn_of_cursor(child_cursor)
            ref = cur.referenced or cur.get_definition()
            if ref is None:
                continue
            base_fqn = fqn_of_cursor(ref)
            if not child_fqn or not base_fqn:
                continue
            base_node = class_nodes.get(base_fqn)
            etype = "IMPLEMENTS" if (base_node and base_node["is_abstract"]) else "INHERIT"
            add_edge(child_fqn, base_fqn, etype)

        # --- COMPOSE: Class → Class ---
        if cur.kind == CursorKind.FIELD_DECL:
            if is_from_system_header(cur):
                continue
            owner = cur.semantic_parent
            if owner is None:
                continue
            owner_fqn = fqn_of_cursor(owner)
            field_fqn = fqn_from_type(cur.type, known_class_fqns)
            if field_fqn:
                add_edge(owner_fqn, field_fqn, "COMPOSE")
            for fqn in fqns_from_type_recursive(cur.type, known_class_fqns):
                if fqn != field_fqn:
                    add_edge(owner_fqn, fqn, "USE_TYPE")

        # --- USE_TYPE: Class → Class (params / return types)
        #     ACCEPTS: Method → Class  (parameter types)
        #     RETURNS: Method → Class  (return type)
        # ---
        if cur.kind in (CursorKind.PARM_DECL,
                        CursorKind.CXX_METHOD,
                        CursorKind.FUNCTION_DECL,
                        CursorKind.CONSTRUCTOR):
            if is_from_system_header(cur):
                continue
            owner = cur.semantic_parent
            if owner is None:
                continue
            if cur.kind == CursorKind.PARM_DECL:
                # parameter → attribute to owning method AND owning class
                method_cursor = owner                  # the method
                class_cursor  = owner.semantic_parent  # the class
                if class_cursor is None:
                    continue
                class_fqn  = fqn_of_cursor(class_cursor)
                method_sig = method_signature(method_cursor)
                if class_fqn not in known_class_fqns:
                    continue
                for fqn in fqns_from_type_recursive(cur.type, known_class_fqns):
                    add_edge(class_fqn,  fqn, "USE_TYPE")   # Class → Class (kept for compatibility)
                    add_edge(method_sig, fqn, "ACCEPTS")     # Method → Class (new)
                continue

            owner_fqn = fqn_of_cursor(owner)
            if owner_fqn not in known_class_fqns:
                continue

            # return type edges
            if hasattr(cur, "result_type"):
                try:
                    method_sig = method_signature(cur)
                    for fqn in fqns_from_type_recursive(cur.result_type, known_class_fqns):
                        add_edge(owner_fqn,  fqn, "USE_TYPE")  # Class → Class (kept)
                        add_edge(method_sig, fqn, "RETURNS")   # Method → Class (new)
                except Exception:
                    pass

        # --- CALLS: Method → Method ---
        if cur.kind == CursorKind.CALL_EXPR:
            ref = cur.referenced
            if ref is None:
                continue
            if ref.kind not in METHOD_KINDS:
                continue

            # callee: prefer definition for consistent signature, fall back to ref
            callee_def = ref.get_definition() if ref.get_definition() is not None else ref
            callee_sig = method_signature(callee_def)
            if callee_sig not in known_method_ids:
                continue

            # caller: walk up to find the enclosing method definition
            caller_sig = None
            p = cur.semantic_parent
            while p is not None:
                if p.kind in METHOD_KINDS:
                    s = method_signature(p)
                    if s in known_method_ids:
                        caller_sig = s
                    break
                p = p.semantic_parent

            if caller_sig:
                add_edge(caller_sig, callee_sig, "CALLS")

    # ------------------------------------------------------------------ #
    # Build output                                                         #
    # ------------------------------------------------------------------ #
    all_nodes = list(class_nodes.values()) + list(method_nodes.values())
    edges = [{"src": s, "dst": d, "type": t} for s, d, t in sorted(edge_set)]

    return {
        "nodes": all_nodes,
        "edges": edges,
        "scope": "single_translation_unit",
        "stats": {
            "class_nodes": len(class_nodes),
            "method_nodes": len(method_nodes),
            "edges": len(edges),
            "edge_type_counts": {
                et: sum(1 for e in edges if e["type"] == et)
                for et in ("INHERIT", "IMPLEMENTS", "COMPOSE", "USE_TYPE", "DEFINES", "CALLS", "ACCEPTS", "RETURNS")
            }
        }
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Extract hybrid class+method dependency graph from C++.")
    ap.add_argument("path", help="Path to .cpp / .h file")
    ap.add_argument("--flag", action="append", default=[], metavar="FLAG",
                    help="Clang compile flag (repeatable, e.g. --flag=-std=c++17)")
    ap.add_argument("--ignore-std", action="store_true",
                    help="Exclude std:: namespace classes/methods from the graph")
    args = ap.parse_args()

    result = extract_graph(args.path, args.flag, args.ignore_std)

    with open("graph.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()