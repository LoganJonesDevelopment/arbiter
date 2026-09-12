# Arbiter

## Design

Every screen follows the fleet design system at `~/repos/fleet-ui/DESIGN.md` and passes both checklists in `~/repos/fleet-ui/checklists/` before it is called done. Tokens and primitives are vendored from that package with `~/repos/fleet-ui/scripts/sync.sh frontend/src` into `src/fleet/`; edit them there, never in this repo. Build screens from the primitives; add a primitive to fleet-ui before hand-rolling one. New screens use the system; an existing screen converts when it is next changed.
