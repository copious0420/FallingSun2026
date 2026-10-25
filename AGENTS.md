<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## SkyWatch app

- Drone movement is simulated in a module-level singleton store (src/lib/simulator.ts) that survives route navigation; it must never run on the server (interval starts only on first client subscribe), and its initial state uses a seeded PRNG so SSR and client hydration match.
- Threat events from HIGH/CRITICAL escalations and operator actions are logged to the drone_alerts table from the browser client (anon insert+select policies, no auth in this app).
- Removed unused src/components/ui/chart.tsx (shadcn chart template) — it only typechecks against Recharts v2 and the app uses Recharts v3 directly.
