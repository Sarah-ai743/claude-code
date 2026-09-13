#!/usr/bin/env python3
"""Merge authored visual specifications into the Short sources.

Run once per batch of visual specs. Reads VIS dicts from the given modules and
writes the per-scene `v` blocks, the cast and the project defaults into the source
files, then the normal build renders them.
"""
import json, pathlib, importlib.util, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "shorts" / "_system" / "sources"


def load(path):
    spec = importlib.util.spec_from_file_location("vis", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.VIS


def main(paths):
    vis = {}
    for p in paths:
        vis.update(load(p))
    for f in sorted(SRC.glob("*.json")):
        data = json.loads(f.read_text())
        changed = False
        for s in data:
            if s["id"] not in vis:
                continue
            v = vis[s["id"]]
            for key in ("default_environment", "default_lighting", "characters"):
                if key in v:
                    s[key] = v[key]
            if len(v["scenes"]) != len(s["scenes"]):
                sys.exit(f"{s['id']}: {len(v['scenes'])} specs for {len(s['scenes'])} scenes")
            for scene, spec in zip(s["scenes"], v["scenes"]):
                scene["v"] = spec
                tags = spec.get("_characters")
                if tags is not None:
                    scene["characters"] = tags
            changed = True
            print(f"merged visual specs into {s['id']} ({len(v['scenes'])} scenes)")
        if changed:
            f.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main(sys.argv[1:])
