# PWA Device Debugger

A local macOS WebKit preview for an arbitrary PWA, plus a reproducible, photo-based screen-geometry measurement pipeline. **No sampler application or samples are included.**

- Open a URL directly, or serve an existing static build from a directory.
- Portrait and landscape windows open together.
- Resize the windows freely: only presentation scale changes; the PWA viewport stays fixed.
- A native WebKit host requests at least 2× rendering density. On a 1× monitor this is supersampling, not extra physical monitor pixels.
- The full rectangle remains rendered. Only the area beyond the fitted screen boundary is faded, with no outline.
- The supplied iPhone 12 Pro Max profile has identical Bézier corners, straight edges, and mirrored notch transitions. Landscape shows notches at both ends by default, as a conservative debugging aid. Use `--single-notch` for physical-device geometry.
- The injected input layer blocks idle mouse movement and hover events and forwards pressed pointer gestures as `pointerType: touch`. No PWA source files are modified.

## Quick start

Requirements: macOS, Node.js 20+, and Apple's Command Line Tools (`xcode-select --install` if absent). No npm dependencies are required for the debugger. The Swift host compiles on first use.

```sh
git clone https://github.com/Nicolas-Wyler/pwa-device-debugger.git
cd pwa-device-debugger
node src/cli.mjs --url https://your-pwa.example/
```

For an existing static build:

```sh
node src/cli.mjs --dir /absolute/path/to/your/build
```

Or run the small generic fixture shipped with this tool:

```sh
node src/cli.mjs --dir examples/smoke
```

Close both windows or press Ctrl+C to stop. A URL loads as a top-level WebKit page, so iframe restrictions do not prevent opening it. A local directory is served on a random localhost port, bound only to `127.0.0.1`. There is no upload or hosting service.

A non-interactive home indicator stays at the bottom edge in both orientations. An optional portrait keyboard screenshot overlay appears while text fields are focused; see the manual for importing your own crop.

See the [quick manual](docs/QUICK_MANUAL.md), [measurement workflow](docs/MEASUREMENT.md), and [technical limits](docs/LIMITATIONS.md).

## Measure a different display

```sh
python3 -m venv .venv
.venv/bin/pip install -r measurement/requirements.txt
.venv/bin/python measurement/calibrate.py --width 1284 --height 2778 --output artifacts/references
.venv/bin/python measurement/extract.py /path/to/white.HEIC /path/to/live-photo.MOV --output artifacts/frames
.venv/bin/python measurement/measure.py --white artifacts/frames/white-0.png --width 2778 --height 1284 --output artifacts/measurement
.venv/bin/python measurement/fit.py --measurement artifacts/measurement/measurement.npz --output artifacts/fitted --name 'My measured phone' --scale 3
node src/cli.mjs --url https://your-pwa.example/ --profile artifacts/fitted/profile.json
```

The fitter expects a landscape photograph with the notch on the left. It models one conventional notch with four identical corners. Other device topologies require a custom segment profile; it does not infer a Dynamic Island automatically. Review the overlay and adjust the profile's safe-area values before use. **Safe areas are software layout margins, not the physical boundary.**

## Verification

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
node src/cli.mjs --dir examples/smoke --verify
```

`--verify` resizes both native windows, records CSS viewport and engine pixel density, compares fixture layout, probes idle/pressed input, and writes PNGs plus `artifacts/check/verification.json`. See the manual for expected results. It leaves the windows open for inspection.

## Repository contents and privacy

Only debugger source, a generic verification page, geometry metadata and measurement scripts are tracked. Local app directories, original photographs, generated references, recordings, screenshots, build products and verification output are ignored. Loading a remote PWA still makes its normal network requests. Preview state is ephemeral and separate from Safari and installed PWAs.

## Status and permissions

Version 0.1.0, macOS developer tooling. A preview cannot exactly reproduce an iPhone's iOS engine, hardware, audio session or permissions. The geometry is an approximation from photographs, not an official Apple drawing. Publication does not by itself grant a software license; contact the repository owner for reuse permissions until an explicit license is chosen.
