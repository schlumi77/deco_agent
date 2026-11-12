# Deco Agent web dashboard

The React front end for Deco Agent. It runs the shared decompression engine
(`../shared/engine/`) directly in the browser, so it works offline once loaded.

See the [project README](../README.md) for what the planner does and how the
repository is organised.

## Commands

Run these from this directory, or use `npm run web` from the repository root
to start the dev server.

```bash
npm run dev      # dev server on http://localhost:5173
npm run lint     # ESLint
npm run build    # typecheck, then production build into dist/
npm run preview  # serve the production build locally
```

## Notes

- Engine code is imported through the `@shared/*` alias, declared in
  `tsconfig.app.json` and mirrored in `vite.config.ts`.
- Form defaults come from `PLAN_DEFAULTS` in `../shared/config.ts`, the same
  values the CLI uses.
- The charts are loaded on demand so Recharts stays out of the initial bundle.
