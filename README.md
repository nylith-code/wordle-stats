# Wordle Stats Generator

A static HTML app for turning copied Discord Wordle bot results into a shareable standings image.

If you do not want to run it locally, use the official published version at <https://wordle.nylith.com/>.

## Usage

Use the published version, or run a local static server and open it in a browser. The app uses a native JavaScript module, so opening `index.html` directly with `file://` is not reliable.

```sh
bun run serve
```

Then open <http://localhost:8000/> and follow the prompts to paste Discord search results, configure the report, then copy or download the generated PNG.

The app stores pasted bot data and settings in your local browser storage. No data is uploaded or shared with anyone.

## Development

Install dependencies with Bun:

```sh
bun install
```

Useful commands:

```sh
bun run test
bun run typecheck
bun run lint
bun run format
bun run check
```

The app intentionally uses one native browser module at [`src/app.js`](src/app.js). Pure parsing and stats helpers are exported from that module so tests can import them directly.

## Release Version

There is no build step. For a release, manually keep these version values in sync:

- `APP_VERSION` in [`src/app.js`](src/app.js)
- The cache-busting query string on the module script in [`index.html`](index.html)
- The package version in [`package.json`](package.json)

The footer version is populated from `APP_VERSION` when the module loads.
