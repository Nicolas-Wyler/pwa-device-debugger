# iPhone 12 Pro Max calibration assets

These are the seven original generated reference patterns: three multiscale grayscale, three pure black/white, and one white image, all 1284 × 2778 pixels. They contain no photographs or sampler content. Use the exact matching reference when registering photographs; the generator may produce different patterns.

`mask-portrait.svg` and `mask-landscape.svg` contain the complete fitted physical boundary: rounded corners and notch. Black means outside the screen; transparent means screen pixels. The landscape mask has the physical single notch on the left. The debugger can additionally mirror it at both ends as a conservative preview option.

The authoritative editable curves are in `../../profiles/iphone-12-pro-max-segments.json`, with viewport and safe-area metadata in `../../profiles/iphone-12-pro-max.json`. Masks use the same coordinate transform as the native debugger. This is a photo-derived approximation, not an official Apple geometry; it excludes the screen crack. No original photos are included.
