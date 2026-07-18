# Illustrated backgrounds

Golf Stars ships these WebP backgrounds from this directory:

- `bg-sunny-range.webp`
- `bg-sunset-hills.webp`
- `bg-chaos-carnival.webp`
- `bg-moonlight-madness.webp`
- `bg-windy-cliffs.webp`
- `bg-duck-derby.webp`
- `title-bg.webp`

Each range also has a transparent `mg-<level-id>.webp` midground overlay. The
game loads both layers independently at runtime and falls back gracefully if
either file is missing or fails to load.
