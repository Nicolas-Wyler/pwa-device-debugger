# PWA Device Debugger

A local macOS WebKit preview for an arbitrary PWA, plus a reproducible, photo-based screen-geometry measurement pipeline. **No sampler application or samples are included.**

- Open a URL directly, or serve an existing static build from a directory.
- Portrait and both landscape orientations open together.
- Resize the windows freely: only presentation scale changes; the PWA viewport stays fixed.
- A native WebKit host requests at least 2× rendering density. On a 1× monitor this is supersampling, not extra physical monitor pixels.
- The full rectangle remains rendered. Only the area beyond the fitted screen boundary is faded, with no outline.
- The supplied iPhone 12 Pro Max profile has identical Bézier corners, straight edges, and mirrored notch transitions. Separate landscape-left and landscape-right windows show a single notch on the corresponding side, with mirrored safe-area insets.
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

Close all preview windows or press Ctrl+C to stop. A URL loads as a top-level WebKit page, so iframe restrictions do not prevent opening it. A local directory is served on a random localhost port, bound only to `127.0.0.1`. There is no upload or hosting service.

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

Only debugger source, a generic verification page, geometry metadata and measurement scripts are tracked. Local app directories, original photographs, recordings, screenshots, build products and verification output are ignored. Loading a remote PWA still makes its normal network requests. Preview storage is persistent and separate from Safari and installed PWAs. Use a stable `--port` for local previews to retain the same storage origin across restarts.

## Status and permissions

Version 0.2.0, macOS developer tooling. A preview cannot exactly reproduce an iPhone's iOS engine, hardware, audio session or permissions. The geometry is an approximation from photographs, not an official Apple drawing. Publication does not by itself grant a software license; contact the repository owner for reuse permissions until an explicit license is chosen.

## Included calibration assets

The [iPhone 12 Pro Max asset pack](calibration/iphone-12-pro-max/) includes the original seven generated reference images and complete transparent SVG screen masks in both orientations. Original photographs remain excluded.

## Live local development

`--dir` serves current source directly and watches source edits. Both views reload automatically after a short debounce; offline worker caching is bypassed in local directory mode. Existing windows stay in place. `src/version.js`, when present, gets a visible local development suffix for every revision. Use `--port 49321` to keep a stable storage origin across restarts.

Before reload, the debugger dispatches `debugger-before-reload`. Apps can register asynchronous save work using `event.detail.waitUntil(savePromise)`. A rejected save prevents reload. The three views share the single application runtime described below; a separate application-specific BroadcastChannel adapter is not required for mirroring. The injected `window.__PWA_DEVICE_DEBUGGER__` flag identifies local directory mode.

Touch simulation: normal drag is one touch; Shift-drag moves two touches together; Command-drag expands two touches about a fixed center; Shift-Command-drag reverses the radial movement and clamps the pair at 24 CSS pixels. Modifier previews are visual only until pressed. Scroll inertia follows released gestures where scrolling is allowed; Play controls with `touch-action:none` remain locked.

### Shared-session debugging and logs

The three windows now project **one running application**. Portrait owns application logic and audio; landscape windows receive DOM changes, form state, modal/popover state, canvas frames, and animation timing. Clicks, touch drags, two-contact gestures, and keyboard edits in any window are routed to that runtime. Audio runs once. Each projection retains its viewport and safe-area insets. The debugger recalculates piano-key spacing and custom track/menu anchors for each viewport; it does not edit the application's source files.

Every launch writes local files under `artifacts/check/` (or `--output`):

- `interactions-<timestamp>.jsonl`: ordered, timestamped clicks, pointer contacts/movement/release (including both pinch contacts), scroll positions, focus, keyboard and field changes, and JavaScript errors. Entries identify the originating view, target ID/label, modifiers and values. Password field values and keystrokes are redacted from the interaction log. Treat logs as private: ordinary typed text is included.
- `runtime.log`: appended native output and errors, including process exit status.
- `synchronization.json`: periodically refreshed button, input, dialog and piano state from all three views for comparison.

These files and private keyboard reference crops remain ignored by Git. A saved local launch configuration also allows reopening the native host without a missing-argument crash; use the project launcher to ensure its local server is running.

Projection is asynchronous, not frame-locked: visual properties/canvases are sampled at 20 Hz, with DOM changes delivered as they happen. Browser security still applies: file choosers, permission requests and other trusted-user-activation workflows may require interacting with the portrait runtime directly. JavaScript layout code executes in the portrait runtime; this is a shared-session comparison tool, not three independent full-device engines.

Optional real-WebKit shared-session regression tests (requires Playwright and its WebKit runtime):

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/shared-session.browser.mjs
```
