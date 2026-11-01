#!/usr/bin/env python3
"""Parse an Android uiautomator XML dump into a compact, greppable TSV.

One line per node. Columns:
  idx  cls  click  enabled  focusable  text  desc  resid  bounds  cx  cy

`--interactive-only` (default) keeps nodes a user could actually operate:
clickable, long-clickable, focusable, editable, or scrollable containers,
plus any node carrying text or a content-desc (so assertions can read the
screen). `--all` emits every node.
"""
import argparse
import sys
import xml.etree.ElementTree as ET

OPERABLE = ("clickable", "long-clickable", "focusable", "editable", "scrollable")


def center(bounds: str):
    # bounds format: [l,t][r,b]  ->  strip '[', ']' and ',' before splitting
    try:
        parts = bounds.replace("[", " ").replace("]", " ").replace(",", " ").split()
        left, top, right, bottom = map(int, parts)
    except ValueError:
        return "", ""
    return (left + right) // 2, (top + bottom) // 2


def clean(value) -> str:
    if not value:
        return ""
    # Collapse newlines/tabs so one node never becomes several TSV rows.
    return " ".join(value.split())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--interactive-only", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("path", nargs="?", default="-")
    args = ap.parse_args()

    raw = sys.stdin.read() if args.path == "-" else open(args.path, encoding="utf-8").read()
    # uiautomator can prefix the XML with a stray byte-order mark / status line.
    start = raw.find("<?xml")
    if start == -1:
        start = raw.find("<hierarchy")
    if start == -1:
        print("uiparse: no XML found in dump", file=sys.stderr)
        return 2
    try:
        root = ET.fromstring(raw[start:])
    except ET.ParseError as exc:
        print(f"uiparse: malformed XML: {exc}", file=sys.stderr)
        return 2

    idx = 0
    for node in root.iter():
        if node.tag == "hierarchy":
            continue
        attrs = node.attrib
        text = clean(attrs.get("text"))
        desc = clean(attrs.get("content-desc"))
        operable = any(attrs.get(k) == "true" for k in OPERABLE)
        if args.interactive_only and not (operable or text or desc):
            continue
        cx, cy = center(attrs.get("bounds", ""))
        idx += 1
        print(
            "\t".join(
                [
                    str(idx),
                    attrs.get("class", "").rsplit(".", 1)[-1],
                    "1" if attrs.get("clickable") == "true" else "0",
                    "1" if attrs.get("enabled") == "true" else "0",
                    "1" if any(attrs.get(k) == "true" for k in OPERABLE) else "0",
                    text.replace("\t", " "),
                    desc.replace("\t", " "),
                    attrs.get("resource-id", ""),
                    attrs.get("bounds", ""),
                    str(cx),
                    str(cy),
                ]
            )
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())