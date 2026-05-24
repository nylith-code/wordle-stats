// @ts-check

import { $ } from 'bun';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const version = JSON.parse(await Bun.file(new URL('package.json', root)).text()).version;
const distPath = fileURLToPath(dist);
const assetsPath = fileURLToPath(new URL('assets/', dist));
const srcPath = fileURLToPath(new URL('src/', dist));
const cssInputPath = fileURLToPath(new URL('src/app.css', root));
const cssOutputPath = fileURLToPath(new URL('assets/app.css', dist));

await $`rm -rf ${distPath}`;
await $`mkdir -p ${assetsPath} ${srcPath}`;

await $`bunx tailwindcss -i ${cssInputPath} -o ${cssOutputPath} --minify`;

/** @param {string} value */
const replaceVersion = (value) => value.replaceAll('__APP_VERSION__', version);

await Bun.write(new URL('index.html', dist), replaceVersion(await Bun.file(new URL('src/index.html', root)).text()));
await Bun.write(new URL('src/app.js', dist), Bun.file(new URL('src/app.js', root)));

const cname = Bun.file(new URL('CNAME', root));
if (await cname.exists()) await Bun.write(new URL('CNAME', dist), cname);
