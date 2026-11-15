async function get(port) {
  return await fetch(`http://localhost:${port}/somefile`, {
    credentials: 'include',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:159.0) Gecko/20100101 Firefox/159.0',
      Accept:
        'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
      'Accept-Language': 'en-US,en;q=0.9',
      Range: `bytes=${5000000000}-${6000000000}`,
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-origin',
      Priority: 'u=4',
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    },
    referrer: `http://localhost:${port}/somefile`,
    method: 'GET',
    mode: 'cors',
  });
}

console.time('Unenc');
console.log('Get unenc.');
const unenc = await get(8081);
console.timeLog('Unenc');
console.log('Buffer unenc.');
const unencBuf = Buffer.from(await unenc.arrayBuffer());
console.timeEnd('Unenc');

console.time('Enc');
console.log('Get enc.');
const enc = await get(8080);
console.timeLog('Enc');
console.log('Buffer enc.');
const encBuf = Buffer.from(await enc.arrayBuffer());
console.timeEnd('Enc');

console.time('Ref');
console.log('Get ref.');
const ref = await get(8082);
console.timeLog('Ref');
console.log('Buffer ref.');
const refBuf = Buffer.from(await ref.arrayBuffer());
console.timeEnd('Ref');

// console.log('Hex enc.');
// const refHex = refBuf.toString('hex');
// console.log('Hex enc.');
// const unencHex = unencBuf.toString('hex');
// console.log('Hex enc.');
// const encHex = encBuf.toString('hex');

// console.log(refHex);
// console.log();
// console.log(unencHex);
// console.log();
// console.log(encHex);
// console.log();

console.log();
console.log('Comparisons:');
console.log(
  `Unencrypted compare reference: ${Buffer.compare(refBuf, unencBuf)}`,
);
console.log(`Encrypted compare reference: ${Buffer.compare(refBuf, encBuf)}`);
