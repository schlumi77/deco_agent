# Reference dive comparison

This folder checks the planner against an external decompression planner
(Subsurface, MultiDeco or similar). The dives live in [`dives.ts`](dives.ts);
each one becomes a test that fails if this planner drifts from the external
result by more than a tolerance.

Until a dive has a reference result it is reported as a **todo**, so CI stays
green while the numbers are being collected.

## Workflow

1. Print every reference dive with this planner's current result:

   ```bash
   npm run reference
   ```

2. Plan each dive in the external planner with the settings below.
3. Paste the result into [`dives.ts`](dives.ts) as the dive's last argument:

   ```ts
   dive('oc-50m-20min-air', 'OC, 50 m for 20 min on air (CLI example)',
       { depth: 50, bottom_time: 20, bottom_gas: 'Air', deco_gases: STANDARD_DECO },
       {
           source: 'Subsurface 6.0.5123, 2026-11-20',
           first_stop: 18,                       // m, 0 for no stops
           stops: [{ depth: 18, time: 2 }, { depth: 15, time: 2 }, /* ... */],
           run_time: 55,                         // min at surfacing
           notes: 'ascent 9 m/min, cannot set 1 m/min above 10 m',
       }),
   ```

4. Run `npm run test -- run` (or `npm run reference` for a summary).

## Settings to match

The external planner must plan the dive the way this one does. Where it can't
match a setting, plan as close as it allows and say what differs in `notes`.
The reference dives are set up for **GUE Deco Planner** via `gue()` in
`dives.ts`; for another planner, adapt or replace that helper.

| Setting | This planner |
|---|---|
| Model | Bühlmann ZHL-16C with gradient factors; GF Low applies at the first stop. ZHL-16B is not compared. |
| Water and surface | Salt water, 10 m = 1 bar; surface pressure 1013 mbar |
| Descent | 20 m/min. This planner's bottom time starts on arrival at depth; the reference dives use `gue()` in `dives.ts`, which takes the reference planner's bottom time (descent included, as in GUE Deco Planner) and subtracts the descent. `npm run reference` prints both figures. |
| Ascent | 10 m/min. Over the last 10 m this planner defaults to 1 m/min (`final_ascent_rate`); `gue()` sets it to the ascent rate, as GUE Deco Planner ascends at one rate to the surface. |
| Stops | Every 3 m; last stop at 6 m unless the dive says 3 m; stop times in whole minutes |
| Gas switches | On ascent, to the richest listed deco gas within pO2 1.6 that has more oxygen than the bottom gas. MODs use a 1 bar surface: oxygen at 6 m, Tx 50/15 at 22 m. On open circuit, a 1 min stop at each switch depth (21 m for Tx 50/15, 6 m for oxygen) even without a deco obligation there; GF Low stays anchored at the first stop the ceiling requires. No switch stop on the CCR loop, or at the bottom if the gas is usable there. |
| Safety stop | None |
| CCR | Constant setpoint; loop mix computed with water vapour 0.0627 bar |

## Tolerance

A dive agrees when:

- the **first stop** is within **3 m** (one stop), and
- the **run time** is within **3 min or 10 %** of the reference, whichever is larger.

Individual stops are not compared, because planners round stop times
differently. They are printed side by side when a dive fails.

A dive can override the tolerance by wrapping it, with the reason in `notes`:

```ts
{ ...dive('oc-90m-30min-tx1265-gf4070', /* ... */), tolerance: { run_time_min: 8 } },
```

## When a dive fails

A failure means either a defect in this planner or a convention the two
planners don't share. Find out which before changing anything:

- **Convention:** record it in `notes`, and widen the dive's tolerance only if
  the difference is understood.
- **Defect:** fix the engine. If the fix changes plans, say so in the commit
  and the PR (see Versioning in CLAUDE.md).
