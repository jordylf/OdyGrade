"""Package source, unsigned CEP and the Windows native development kit.

Standard library only. All user-facing archives are written next to the source
directory under outputs/. No SDKs, signing materials, Git databases or build trees.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = ROOT.parent
EXCLUDE = {".git", "release", "node_modules", ".test-output", ".native-build", ".adobe-build", ".codebase-memory", ".playwright-mcp", "__pycache__", "signing"}


def archive(name, members):
    target = OUTPUTS / name
    if target.resolve().parent != OUTPUTS.resolve():
        raise ValueError("Archive target must stay in outputs")
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as bundle:
        for source, member in sorted(members, key=lambda item: str(item[1])):
            if source.is_symlink():
                raise ValueError(f"Refusing symlink in archive: {source}")
            bundle.write(source, str(member).replace("\\", "/"))
    with zipfile.ZipFile(target) as bundle:
        if bundle.testzip() is not None:
            raise ValueError("Archive failed CRC verification")
        if any(".git/" in name or ".native-build/" in name or "signing/" in name for name in bundle.namelist()):
            raise ValueError("Private/build material in archive")
        print(f"{target.name}: {len(bundle.namelist())} files / {target.stat().st_size} bytes")
    return target


def main():
    subprocess.run(["node", str(ROOT / "tools/package.cjs")], cwd=ROOT, check=True)
    source = [(p, Path("OdyGrade") / p.relative_to(ROOT)) for p in ROOT.rglob("*")
              if p.is_file() and not any(part in EXCLUDE for part in p.relative_to(ROOT).parts)
              and not p.name.endswith(".log")]
    stage = ROOT / "release/OdyGrade-CEP"
    cep = [(p, Path("com.odyworks.odygrade") / p.relative_to(stage)) for p in stage.rglob("*") if p.is_file()]
    archives = [archive("OdyGrade-source.zip", source), archive("OdyGrade-CEP-dev.zip", cep)]
    native = ROOT / ".native-build/Release"
    # Prebuilt kit is for the locally verified Windows x64 build only.
    if (native / "odygrade-render.exe").is_file():
        native_members = [
            (native / "odygrade-render.exe", Path("bin/odygrade-render.exe")),
            (native / "odygrade-core-tests.exe", Path("bin/odygrade-core-tests.exe")),
            (native / "odygrade-core.lib", Path("lib/odygrade-core.lib")),
            (ROOT / "native/include/odygrade/core.hpp", Path("include/odygrade/core.hpp")),
            (ROOT / "native/DEV-KIT-README.md", Path("README.md")),
            (ROOT / "native/README.md", Path("native/README.md")),
            (ROOT / "docs/COLOR-MANAGEMENT.md", Path("docs/COLOR-MANAGEMENT.md")),
            (ROOT / "docs/NEXT-NATIVE-INTEGRATION.md", Path("docs/NEXT-NATIVE-INTEGRATION.md")),
            (ROOT / "docs/NATIVE-VIDEO.md", Path("docs/NATIVE-VIDEO.md")),
        ]
        archives.append(archive("OdyGrade-native-win64-dev.zip", native_members))
    handoff = OUTPUTS / "OdyGrade-Claude-Handoff.md"
    if handoff.is_file():
        archives.append(handoff)
    for name in ["OdyGrade-film-demo.mov", "OdyGrade-film-demo.mp4", "OdyGrade-film-demo.json",
                 "OdyGrade-shot-grade.json", "OdyGrade-shot-demo.mov"]:
        demo = OUTPUTS / name
        if demo.is_file():
            archives.append(demo)
    checksums = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in archives}
    (OUTPUTS / "OdyGrade-checksums.json").write_text(json.dumps(checksums, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
