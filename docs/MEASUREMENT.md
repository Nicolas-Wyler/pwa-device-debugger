# Photograph-to-screen geometry workflow

## 1. Generate references

Create three grayscale / pure black-and-white pairs plus one uniform white image:

```sh
python measurement/calibrate.py --width 1284 --height 2778 --output artifacts/references
```

Patterns are deterministic and known at native resolution. Features progress from coarse at the center to fine near edges. Preserve the original PNGs; fine patterns may be unresolved or show moiré in the camera and must not be treated as reliable if blurred.

## 2. Capture photographs

Display each reference edge-to-edge, without cropping, margins, controls or system overlays over the boundary. Confirm orientation and aspect ratio. Use a stationary camera nearly perpendicular to the phone, moderate display brightness, no clipped whites, sharp focus, and minimal reflections. The entire screen must be visible. Capture original files, not compressed chat copies. A rear phone camera is usually preferable to a webcam.

White reveals the complete illuminated boundary. Noise establishes pixel correspondences. Several patterns expose inconsistent matches/reflections; they do not automatically eliminate lens distortion. Use another camera position for an independent validation set.

## 3. Extract images and Live Photo frames

```sh
python measurement/extract.py /photos/IMG_001.HEIC /photos/IMG_001.MOV --output artifacts/frames --fps 2
```

HEIC is commonly the still half of a Live Photo. Supply its separate MOV companion for motion frames. HEIC coding tiles, thumbnails and gain maps are not extra time frames. `extraction.json` records what was actually extracted. MOV extraction requires `ffmpeg` on PATH. Originals are never modified.

## 4. Check reference registration

For a landscape photograph of a portrait reference rotated counterclockwise:

```sh
python measurement/register.py --photo artifacts/frames/IMG_001-0.png --reference artifacts/references/bw-1.png --rotate 90 --output artifacts/registration
```

This uses SIFT, ratio filtering and RANSAC. Inspect `registered-photo.png` and the inlier count/errors. Try the matching reference and correct rotation if it fails. A low residual describes the matched features only, not boundary accuracy. Rectify **each camera pose separately**; do not apply one homography to a photo after the camera moved.

## 5. Extract the physical boundary

The fitter expects landscape, with the notch on the left. Rotate photos first if needed. For the default phone use width 2778 and height 1284:

```sh
python measurement/measure.py --white artifacts/frames/white-0.png --width 2778 --height 1284 --output artifacts/measurement
```

The script uses brightness segmentation, robust straight-edge fits and perspective rectification. If another bright object wins, pass `--roi x y width height`. If automatic segmentation fails, specify `--threshold 160`. If edge fitting fails, supply the four projected corners of the full rectangular display as `--quad TLx TLy TRx TRy BRx BRy BLx BLy` (not the ends of the rounded arcs).

Inspect `boundary-check.png`, `rectified-white.png`, and `screen-mask.png`. Do not proceed blindly when highlights, screen cracks or reflections have corrupted the boundary. Lens correction is not automatic: use a calibrated lens workflow first when its distortion is material.

## 6. Fit a hardware-shaped model

```sh
python measurement/fit.py --measurement artifacts/measurement/measurement.npz --output artifacts/fitted --name 'Measured phone' --scale 3
```

The model uses straight sides, one shared cubic corner reflected at all four corners, and a conventional left notch mirrored about the long axis. Every endpoint control handle is horizontal or vertical. The comparison PNG shows raw measurements, the constrained approximation, line endpoints and control handles. Local edge bumps caused by glass damage are replaced by straight sides.

The fitter normalizes coordinates to the reference phone aspect for fitting and scales exported points back; for substantially different shapes, inspect carefully and create a more appropriate topology. It is not an automatic reconstruction of arbitrary cutouts or Dynamic Islands.

`profile.json` and `segments.json` can be passed directly to the debugger. Edit safe areas: exported defaults are placeholders, not a measurement of iOS layout margins.

## 7. Validate

Reproject the fitted geometry to the original photographs with the saved homography, and compare against independently captured views. Check notch shoulders, all four corners and straight edges. Record discrepancies and confidence rather than claiming exact hardware pixels from camera photographs. The scripts save the homography and extracted mask for this purpose; cross-view validation remains a manual step.

Original pictures, new fitted results and reports belong in `artifacts/`, which is excluded from Git. The explicitly published generated reference patterns and fitted masks for the iPhone 12 Pro Max are in `calibration/iphone-12-pro-max/`.
