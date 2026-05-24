# Wordle Stats Generator

A static HTML app for turning copied Discord Wordle bot results into a shareable standings image.

## Usage

Use the published version at <https://wordle.nylith.com/>, or run it locally on your own machine with [Bun](https://bun.com/):

```sh
bun run serve
```

Then open <http://localhost:8000/> and follow the prompts to paste Discord search results, configure the report, then copy or download the generated PNG.

The app stores pasted bot data and settings in your local browser storage. No data is uploaded or shared with anyone.

## Development

```sh
bun install
bun run build # build for deployment
bun run serve # serve the files locally

# dev/test scripts that must be run before all commits
bun run test
bun run typecheck
bun run lint
bun run format
bun run check
```
