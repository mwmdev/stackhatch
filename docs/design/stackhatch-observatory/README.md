# StackHatch observatory direction

This concept reimagines StackHatch as an architecture observatory: a precise working instrument for keeping a system in view, rather than a conventional SaaS dashboard.

## Route coverage

`core-pages.png` covers the landing page, All Maps, New Map, and the architecture editor. `secondary-pages.png` covers sign-in, settings, admin, support, privacy, and terms. The `/app` resolver does not render a standalone interface, so its destinations are represented by All Maps, New Map, and the editor.

## Visual system

- Fog `#EEF3F3` — primary light surface
- Paper `#FAFCFB` — raised working surface
- Ink `#10222F` — type and high-contrast controls
- Blueprint `#23658A` — navigation and primary actions
- Oxide `#3C9B92` — services and positive state
- Signal `#E47B43` — data and attention state
- Archivo-style compressed display typography, a highly legible humanist body face, and IBM Plex Mono-style utility labels
- Small radii, precise one-pixel borders, restrained elevation, and productive spacing

The signature element is a single continuous routing trace derived from architecture-map edges. It connects navigation, headings, and selected states as a functional datum line. It is intentionally the only expressive flourish; the surrounding interface stays quiet.

## Generation notes

Both boards were produced with the built-in image-generation tool. The current StackHatch editor screenshot was used as a product reference for the first board, and the first board was then used as the visual-system reference for the second.

The mockups are visual direction artifacts. Product copy, data, and secondary controls shown inside them are illustrative; the route responsibilities and core interactions in the application remain authoritative.
