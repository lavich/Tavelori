# Illustration Style

Lexi uses simple, friendly, recognizable and timeless vector illustrations. This file is the drawing checklist; detailed validation and palette guidance live in [`docs/art-standard.md`](docs/art-standard.md).

Visual source: [`docs/references/golden-set-v1.png`](docs/references/golden-set-v1.png). Use it for character, line and composition; use the rules below for project-specific geometry and technical constraints.

```text
Canvas:       320 × 220 (`viewBox="0 0 320 220"`)
Safe area:    20 units
Main stroke:  7–9 units
Fine stroke:  4–6 units
Linecap:      round
Linejoin:     round

Max size:     3072 bytes
Complexity:   about 20 visible shapes
Colors:       usually 5–7 palette roles
Gradients:    none
Filters:      none
Text:         none
Raster:       none
Animation:    none

Perspective:  front or light 3/4
Detail:       low
Silhouette:   recognizable at 64 px
Review size:  all details readable at 160 px
```

## Shape language

- Draw one dominant object or one immediately readable scene over an irregular pastel backdrop; do not use a full rectangular color field.
- Use rounded, slightly asymmetric geometry and a dark `ink` outline. Avoid rigid primitives and sharp decorative corners.
- Keep the subject centered and inside `x: 20–300`, `y: 20–200`. A ground strip or cast ellipse may enter the lower safe area.
- Prefer a front view for faces and symbols; use a light 3/4 view when it explains volume or motion.
- Give people and animals calm, friendly expressions with the same eye and mouth vocabulary.
- Preserve a distinct outer contour. At 64 px the subject must remain identifiable without its caption or internal details.

## Light and volume

- Use flat fills only. Add one simple highlight and one flat or translucent depth shape so the result retains the softly modeled look of the source.
- Create lighter or darker areas with `opacity`, `fill-opacity` or `stroke-opacity` on palette colors.
- Never use gradients, blur, drop shadows, filter effects or new hex colors.

## Color

Use only roles from [`content/art/palette.json`](content/art/palette.json). Themeable roles are `sky`, `cream`, `mist`, `rose`, `mint`, `ink` and `blue`. Object colors keep their meaning: water and glass use `blue-soft`, fruit may use `red`, foliage uses `green`, skin uses `skin`, and wood uses `brown`.

## Reference sets

Finished composition references live in `content/art/references/`: `objects`, `characters` and `actions`. Reusable geometry lives separately in `content/art/parts/`. Copy a part when you need the same figure; consult a reference when choosing proportions, line weight, perspective and detail density.

## Before adding an illustration

1. Check the image at 160 px and 64 px without its label.
2. Compare it with the closest reference category.
3. Run the content tests; new art must pass without a legacy exception.
