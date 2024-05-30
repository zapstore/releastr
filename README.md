# releastr

zap.store app release indexer.

At the moment running in a cronjob, automating checks for new releases of selected apps (see `apps.yaml`). Soon it will support many more options including other signing methods, so that developers can run this in their own machines.

These are the events it's producing: https://github.com/zapstore/zapstore/wiki/Sample-app-events (kinds 1063, 30063, 32267)

## Update or add new apps

Feel free to submit PRs.

## Running

```bash
bun index.js
```

Must have at least one app listed in `apps.yaml`.

Must pass (`.env` file also works) `SK` (nostr private key with which to sign) and `BLOSSOM_DIR`.

Optional: `OVERWRITE` will update regardess if there's an existing release already indexed, and `GITHUB_TOKEN`.

Must have `apksigner`, `apktool`, `xq`, `pandoc` in path (symlink to /usr/bin if necessary).

## License

MIT