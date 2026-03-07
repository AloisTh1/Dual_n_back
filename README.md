# Dual N-Back (React)

A static React-based Dual N-Back game with:
- Position + spoken-letter streams
- Standard auditory letter set: `C, H, K, L, Q, R, S, T` (reduced confusability)
- Custom key bindings (`A` for position, `L` for audio by default)
- Per-round feedback (green/red)
- Level progression at 70%
- Browser-cached history

## Local run

```powershell
npm.cmd start
```

Open `http://localhost:3000`.

## Tests

```powershell
npm.cmd test
```

## Static build

```powershell
npm.cmd run build
```

Outputs to `dist/`.

## GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`.
On push to `main`, GitHub Actions builds and deploys `dist/` to Pages.

## Semantic Release

This repo includes `.github/workflows/release.yml` and `.releaserc.json`.
Push conventional commits to `main` (for example `feat: ...`, `fix: ...`) to generate automated GitHub releases and update `CHANGELOG.md`.

## Support

If you want to support development:
https://buymeacoffee.com/alois_devlp
