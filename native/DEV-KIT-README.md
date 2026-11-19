# OdyGrade 0.3 — Windows x64 core development kit

This is the standalone CPU render core and C++ library, **not an Adobe plugin or
production installer**. Adobe SDK adapters and live timeline integration remain
unfinished. Windows requires a compatible Visual C++ runtime; clean-machine
installation and real-time playback have not been qualified.

- `bin/odygrade-render.exe`: binary full-frame renderer; see native/README.md.
- `bin/odygrade-core-tests.exe`: run six native buffer/alpha/temporal/aspect contract groups.
- `lib/odygrade-core.lib`, `include/odygrade/core.hpp`: matching MSVC C++17 library/header.
- `docs/COLOR-MANAGEMENT.md`: exact source-profile and SDR output contracts.
- `docs/NEXT-NATIVE-INTEGRATION.md`: remaining real Adobe-host acceptance gates.

Use the separate OdyGrade source archive for Node CLI/JSON-to-native snapshot
generation and rebuilding. The renderer accepts internal snapshots v1/v2, not
the editable JSON file directly. Use binary process buffers/streams, not Windows
PowerShell text pipes, for raw pixels. The compiled kit and source snapshot must
stay together; do not mix public C++ headers from a different version.
