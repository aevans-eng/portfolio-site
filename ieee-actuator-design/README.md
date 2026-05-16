# ieee-actuator-design

Static deployment of the IEEE Future Tech Challenge 2026 Phase 3 submission. Lives at `aaronevans.ca/ieee-actuator-design/`.

**Not linked from the portfolio nav, homepage, or sitemap.** Discoverable only via the URL. Judges and teachers get the link; the portfolio's visible content is unaffected.

## What's here

- `index.html` — the product. Copy of `product/app-v3.html` from the IEEE repo (`ieee-future-tech-challenge`).
- `gear-math-tests.html` — judge-runnable verification harness.
- `teacher-guide.html` — companion teacher guide.

## Updating

Don't edit these files directly — the canonical source is in the IEEE repo. To update the deployed version, run the deploy script from the IEEE repo:

```powershell
# from G:/My Drive/c-projects/side-income/ieee-future-tech-challenge
pwsh ./scripts/deploy-public.ps1
```

Then commit and push the deploy repo:

```powershell
cd "G:/My Drive/c-projects/Portfolio/website/deploy"
git add ieee-actuator-design/
git commit -m "Deploy: IEEE actuator design challenge"
git push
```

GitHub Pages rebuilds in ~60 seconds.

## Taking it down

After the IEEE competition (or whenever), delete this folder and push. Nothing else in the portfolio references it.

```powershell
cd "G:/My Drive/c-projects/Portfolio/website/deploy"
git rm -r ieee-actuator-design/
git commit -m "Remove IEEE submission deployment"
git push
```
