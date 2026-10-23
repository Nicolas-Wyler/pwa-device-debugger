# Quick manual

## Open your PWA

1. Install Node 20+ and Apple's Command Line Tools.
2. Run `node src/cli.mjs --url https://example.com/your-pwa/`.
3. Portrait and both landscape orientations open. No debug labels are placed around the phone canvas.
4. Drag a window edge. The phone fills the available space while preserving its aspect ratio and fixed CSS viewport.
5. Press and drag to send touch-style pointer events. Moving the mouse with its button up does not deliver hover or move events to the page. Shift-drag sends two parallel touches; Command-drag expands a pinch; Shift-Command-drag contracts it.
6. Close all three windows to quit. Use Ctrl+C from the launching terminal to stop immediately.

`--dir /path/to/static/build` serves your own existing files without bundling or changing them. For a framework dev server, start that server yourself and pass its URL. Relative navigation and PWA network requests continue to use the supplied origin.

Double-click `Open Preview.command` to enter a URL without typing the launch command. Node must be available on your shell PATH.

## Options

| Option | Purpose |
| --- | --- |
| `--url URL` | Load any HTTP(S) page directly in WebKit |
| `--dir DIRECTORY` | Serve a local static build on localhost |
| `--profile FILE` | Custom JSON profile; default is iPhone 12 Pro Max |
| `--single-notch` | Legacy compatibility flag; each landscape view now has one notch on its corresponding side |
| `--keyboard-image FILE` | Portrait keyboard + accessory-bar crop |
| `--keyboard-landscape-image FILE` | Landscape keyboard + accessory-bar crop |
| `--keyboard-opacity NUMBER` | Overlay opacity, 0–1; default 0.45 |
| `--verify` | Run resize/input/snapshot diagnostics, leaving the windows open |
| `--output DIRECTORY` | Diagnostic destination; default `artifacts/check` |

Use one of `--url` and `--dir`, never both.

## Expected diagnostic results

For the default profile, portrait is 428×926 CSS pixels and landscape 926×428. All three should report `dpr >= 2`, `passed: true`, and, for the generic fixture, `layoutUnchanged: true` after resize. `inputIdleEvents` should be zero. The pressed sequence should contain only touch-style down/move/up events. PNG capture requests use at least a 2× export width; screenshot dimensions and physical monitor resolution are distinct quantities.

`node tests/check-native.mjs artifacts/check` validates the written native diagnostic report after a `--verify` run.

To inspect actual display resolution, look at the engine diagnostics, not just screenshot size. The host requests a 2× backing-scale floor; a 1× external monitor necessarily displays fewer physical pixels than a Retina monitor. No JavaScript override fakes `devicePixelRatio`.

## Geometry profile

The profile JSON references a segment JSON file. Each segment has two points for a straight line or four for a cubic Bézier (start, first control, second control, end). Segments form one continuous closed screen boundary in landscape, notch left, using native image pixels. `nativeWidth / width` converts native pixels to CSS points. Portrait is a 90° rotation. All controls in the included profile are horizontal or vertical relative to their endpoints.

Safe-area arrays are `[top, right, bottom, left]` in CSS pixels. These are separate, editable layout assumptions. Changing them does not change the physical mask.

## Keyboard occlusion preview

The bottom home indicator is always a non-interactive dummy, in portrait and landscape. It does not navigate or reserve layout space.

To use a real portrait keyboard screenshot, crop only the keyboard and its accessory bar, excluding all app pixels:

```sh
python measurement/crop_keyboard.py /path/to/portrait.png --top 1742 --scale 3 --output artifacts/keyboard.png
node src/cli.mjs --url https://example.com/ --keyboard-image artifacts/keyboard.png
```

The default portrait reference is a 1284×2778 screenshot whose keyboard starts at native row 1742: 1036/3 = 345⅓ CSS pixels including the accessory bar and home indicator. The image appears on text-field focus and disappears on blur. It is only a visual overlay: it neither types nor resizes the PWA viewport. No user screenshot is bundled. Without a local crop, the debugger draws a schematic keyboard placeholder. Landscape uses its own screenshot crop. Each overlay height is calculated from its image aspect ratio at the fixed viewport width; a 1280×310 landscape crop is 224.27 CSS pixels high at width 926. Both views default to 45% opacity, revealing covered UI underneath. Local crops at `artifacts/keyboards/portrait.png` and `landscape.png` are loaded automatically and never tracked by Git.

## Shared session and logs

All three windows control one running app; audio runs once. Each view retains its own viewport and safe areas. DOM, form, dialog/popover, canvas and animation state are mirrored, with visual samples at 20 Hz rather than a frame lock. Application-specific JavaScript layout and browser-trusted permission/file-picker actions have the limitations described in the README.

Every launch writes interaction JSONL, native runtime errors and a live three-view state comparison under `artifacts/check/` (or `--output`). These local files are ignored by Git. Ordinary typed text is logged; password-field text and keystrokes are redacted.
