const path = require('node:path');
const fs = require('node:fs/promises');
const svelte = require('svelte/compiler');

(async function () {
  const IndexPageSrc = (
    await fs.readFile(path.resolve(__dirname, 'src/IndexPage.svelte'))
  ).toString();
  const IndexPage = svelte.compile(IndexPageSrc, {
    name: 'IndexPage',
    generate: 'ssr',
    format: 'cjs',
  });

  console.log('Compiling Svelte index page...');

  await fs.writeFile(
    path.resolve(__dirname, 'dist/IndexPage.cjs'),
    IndexPage.js.code
  );
  await fs.writeFile(
    path.resolve(__dirname, 'dist/IndexPage.cjs.map'),
    JSON.stringify(IndexPage.js.map)
  );

  console.log('Done!');
})();
