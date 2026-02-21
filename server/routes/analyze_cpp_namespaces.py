#!/usr/bin/env python3
# server/analyzer/analyze_cpp_namespaces.py  (Windows-friendly, no hardcoded paths)
import sys, json, argparse, os
from collections import defaultdict
from pathlib import Path
import platform
import shutil


# Windows: libclang configuration helper
def configure_libclang_windows():
    """
    Windows: libclang is not shipped by pip package 'clang'.
    We try:
      1) LIBCLANG_FILE (full path to libclang.dll)
      2) LIBCLANG_PATH (directory containing libclang.dll)
      3) Typical LLVM install locations
      4) Where 'clang.exe' is on PATH -> infer libclang.dll next to it
    """
    from clang import cindex

    # 1) explicit file
    lib_file = os.environ.get("LIBCLANG_FILE")
    if lib_file and Path(lib_file).exists():
        cindex.Config.set_library_file(str(Path(lib_file)))
        return True

    # 2) directory containing libclang.dll
    lib_dir = os.environ.get("LIBCLANG_PATH")
    if lib_dir and Path(lib_dir).is_dir():
        cand = Path(lib_dir) / "libclang.dll"
        if cand.exists():
            cindex.Config.set_library_file(str(cand))
            return True

    # 3) typical locations
    candidates = [
        Path(r"C:\Program Files\LLVM\bin\libclang.dll"),
        Path(r"C:\Program Files (x86)\LLVM\bin\libclang.dll"),
        Path.home() / r"scoop\apps\llvm\current\bin\libclang.dll",
        Path.home() / r"scoop\apps\llvm\current\lib\libclang.dll",
        Path.home() / r"scoop\apps\llvm\current\bin\libclang.dll",
        Path(r"C:\LLVM\bin\libclang.dll"),
    ]
    for cand in candidates:
        if cand.exists():
            cindex.Config.set_library_file(str(cand))
            return True

    # 4) infer from clang.exe on PATH
    clang_exe = shutil.which("clang")
    if clang_exe:
        cand = Path(clang_exe).resolve().parent / "libclang.dll"
        if cand.exists():
            cindex.Config.set_library_file(str(cand))
            return True

    return False


#--- setup: clang Python bindings ---
try:
    from clang import cindex
except ModuleNotFoundError:
    # Keep stdout clean JSON only; errors go to stderr
    print(json.dumps({
        "error": "python package 'clang' not installed",
        "hint": "Install pip, then: py -3 -m pip install clang"
    }), file=sys.stderr)
    sys.exit(2)

# Configure libclang (Windows only). On non-windows it will just skip.
if platform.system().lower().startswith("win"):
    ok = configure_libclang_windows()
    if not ok:
        print(json.dumps({
            "error": "libclang.dll not found",
            "hint": "Install LLVM for Windows and set LIBCLANG_FILE or LIBCLANG_PATH",
            "examples": {
                "LIBCLANG_FILE": r"C:\Program Files\LLVM\bin\libclang.dll",
                "LIBCLANG_PATH": r"C:\Program Files\LLVM\bin"
            }
        }), file=sys.stderr)
        sys.exit(3)

# --- helpers: namespaces ---
# This function finds the namespace of a declaration by walking up its semantic parents.
# For example, for a declaration like `namespace A { namespace B { class C; } }`, if
# you pass the cursor for `class C`, it will return "A::B".
def ns_of_decl(decl):
    parts = []
    d = decl
    while d is not None:
        if d.kind == cindex.CursorKind.NAMESPACE:
            parts.append(d.spelling)
        d = d.semantic_parent
    parts.reverse()
    return "::".join([p for p in parts if p])


from clang.cindex import TypeKind


# This function extracts namespaces from a clang Type, including template arguments.
def namespaces_from_type(t):
    """
    Extract namespaces referenced by a clang Type, including template arguments.
    Returns a set of namespace strings.
    """
    out = set()    # namespaces found in this type
    if t is None:
        return out

    # canonicalize
    try:
        t = t.get_canonical()  # canonical type (e.g., typedefs resolved)
    except Exception:
        pass

    # peel pointers/references
    try:
        while t.kind in (TypeKind.POINTER, TypeKind.LVALUEREFERENCE, TypeKind.RVALUEREFERENCE):
            t = t.get_pointee().get_canonical()
    except Exception:
        pass

    # record / enum / template specialization: declaration namespace
    try:
        decl = t.get_declaration()  # the cursor of the type declaration (e.g., class/struct/enum)
        if decl is not None and decl.kind != cindex.CursorKind.NO_DECL_FOUND:
            ns = decl_namespace_of(decl) # namespace of the declaration
            if ns:
                out.add(ns)
    except Exception:
        pass

    # template arguments (e.g., std::vector<Model::X>)
    try:
        n = t.get_num_template_arguments()
        if n is not None and n > 0:
            for i in range(n):
                try:
                    arg_t = t.get_template_argument_type(i)
                except Exception:
                    arg_t = None
                if arg_t is not None:
                    out |= namespaces_from_type(arg_t)
    except Exception:
        pass

    return out

# Heuristic to filter out internal compiler/lib namespaces like __gnu_cxx, __cxxabiv1, etc.
def is_internal_ns(ns: str) -> bool:
    """Ignore internal compiler/lib namespaces like __gnu_cxx, __cxxabiv1, etc."""
    if not ns:
        return False
    root = ns.split("::", 1)[0]
    return root.startswith("__")

# This function finds the namespace of a cursor by walking up its parents. It prefers
# the lexical parent (where it is written in the source code) but falls back to the
# semantic parent if no namespace is found in the lexical chain.
def ns_of_cursor_parent(cur):
    """Return namespace name by walking parents (lexical preferred, semantic fallback)."""
    c = cur
    # Prefer lexical context: where it is written in the source
    while c is not None:
        if c.kind == cindex.CursorKind.NAMESPACE:
            return ns_of_decl(c)
        c = getattr(c, "lexical_parent", None)

    # Fallback: semantic chain
    c = cur
    while c is not None:
        if c.kind == cindex.CursorKind.NAMESPACE:
            return ns_of_decl(c)
        c = getattr(c, "semantic_parent", None)

    return ""

def owner_namespace(cursor):
    return ns_of_cursor_parent(cursor)

def decl_namespace_of(ref_cursor):
    """Namespace of the referenced declaration."""
    if ref_cursor is None:
        return ""
    # Prefer semantic parent of the declaration; fallback to lexical parent
    p = getattr(ref_cursor, "semantic_parent", None)
    ns = ns_of_decl(p) if p is not None else ""
    if not ns:
        p = getattr(ref_cursor, "lexical_parent", None)
        ns = ns_of_decl(p) if p is not None else ""
    return ns

def is_abstract_record(record_cursor):
    for c in record_cursor.get_children():
        if c.kind == cindex.CursorKind.CXX_METHOD:
            try:
                if c.is_pure_virtual_method():
                    return True
            except Exception:
                pass
    return False

def walk(cursor):
    yield cursor
    for ch in cursor.get_children():
        yield from walk(ch)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="path to .cpp")
    ap.add_argument("--flag", action="append", default=[], help="clang compile flag (repeatable)")
    ap.add_argument("--ignore-std", action="store_true", help="ignore std namespace in deps")
    args = ap.parse_args()

    # Parse the translation unit with libclang
    index = cindex.Index.create()
    tu = index.parse(
        args.path,
        args=args.flag,
        options=cindex.TranslationUnit.PARSE_DETAILED_PROCESSING_RECORD
    )

    # first pass: collect namespaces and type counts
    uses = defaultdict(set)     # srcNS -> set(dstNS)
    used_by = defaultdict(set)  # dstNS -> set(srcNS)

    # how many types (class/struct) are declared in each namespace? how many are abstract?
    nb_types = defaultdict(int)
    nb_abstract = defaultdict(int)

    # count types per namespace
    # we use the owner namespace of the record declaration, which is usually the lexical parent namespace.
    for cur in walk(tu.cursor):
        if cur.kind in (cindex.CursorKind.STRUCT_DECL, cindex.CursorKind.CLASS_DECL):
            if not cur.is_definition():
                continue
            ns = owner_namespace(cur)
            if is_internal_ns(ns): 
                continue
            if args.ignore_std and (ns == "std" or ns.startswith("std::")):
                continue
            nb_types[ns] += 1
            if is_abstract_record(cur):
                nb_abstract[ns] += 1

    # dependencies via references
    for cur in walk(tu.cursor):
        if cur.kind in (
            cindex.CursorKind.DECL_REF_EXPR,
            cindex.CursorKind.MEMBER_REF_EXPR,
            cindex.CursorKind.TYPE_REF,
            cindex.CursorKind.TEMPLATE_REF,
            cindex.CursorKind.CALL_EXPR,
            cindex.CursorKind.CXX_BASE_SPECIFIER,
        ):
            ref = cur.referenced
            if ref is None:
                continue

            src_ns = owner_namespace(cur)
            if src_ns == "":
                continue
            dst_ns = decl_namespace_of(ref)

            if args.ignore_std and (dst_ns == "std" or dst_ns.startswith("std::")):
                continue
            if is_internal_ns(dst_ns):
                continue
            if not dst_ns:
                continue
            if src_ns != dst_ns:
                uses[src_ns].add(dst_ns)
                used_by[dst_ns].add(src_ns)

        # dependencies via declared types (catches template args like Model::CoordinateGroup)
        if cur.kind in (
            cindex.CursorKind.FIELD_DECL,
            cindex.CursorKind.PARM_DECL,
            cindex.CursorKind.FUNCTION_DECL,
            cindex.CursorKind.CXX_METHOD,
            cindex.CursorKind.CONSTRUCTOR,
        ):
            # Attribute type-deps to the API owner (not the call site)
            src_owner = cur
            if cur.kind == cindex.CursorKind.PARM_DECL:
                # Parameter belongs to a function/method; attribute to that owner
                if getattr(cur, "semantic_parent", None) is not None:
                    src_owner = cur.semantic_parent
                elif getattr(cur, "lexical_parent", None) is not None:
                    src_owner = cur.lexical_parent

            src_ns = owner_namespace(src_owner)
            if src_ns == "":
                continue

            # collect namespaces from the cursor type (and return type if applicable)
            dst_candidates = set()
            try:
                dst_candidates |= namespaces_from_type(cur.type)
            except Exception:
                pass
            try:
                # for functions/methods: also include result type explicitly
                if hasattr(cur, "result_type"):
                    dst_candidates |= namespaces_from_type(cur.result_type)
            except Exception:
                pass

            for dst_ns in dst_candidates:
                if not dst_ns:
                    continue
                if args.ignore_std and (dst_ns == "std" or dst_ns.startswith("std::")):
                    continue
                if is_internal_ns(dst_ns):
                    continue
                if src_ns != dst_ns:
                    uses[src_ns].add(dst_ns)
                    used_by[dst_ns].add(src_ns)



    all_ns = set(nb_types.keys()) | set(uses.keys()) | set(used_by.keys())
    if "" in uses or "" in used_by or "" in nb_types:
        all_ns.add("")

    out = []
    for n in sorted(all_ns, key=lambda x: (x == "", x)):
        if n == "":
            continue
        if is_internal_ns(n):
            continue
        if args.ignore_std and (n == "std" or n.startswith("std::")):
            continue
        ca = len(used_by.get(n, set()))
        ce = len(uses.get(n, set()))
        A = 0.0 if nb_types.get(n, 0) == 0 else (nb_abstract.get(n, 0) / nb_types[n])
        I = 0.0 if (ca == 0 and ce == 0) else (ce / (ce + ca))
        D = (A + I - 1.0)
        out.append({
            "name": n,
            "Ca": ca,
            "Ce": ce,
            "uses": sorted(list(uses.get(n, []))),
            "used_by": sorted(list(used_by.get(n, []))),
            "A": A,
            "I": I,
            "D": D
        })

    print(json.dumps({"namespaces": out, "scope": "single_translation_unit"}, ensure_ascii=False))

if __name__ == "__main__":
    main()
