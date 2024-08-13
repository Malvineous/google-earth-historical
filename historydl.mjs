import { access, constants, mkdir, readFile, writeFile } from 'node:fs/promises';
import * as assert from 'node:assert';

const urlBase = 'https://khmdb.google.com/flatfile?db=tm'

const rcBound = {
	left: 151.1943,
	right: 151.2123,
	top: -33.8667,
	bottom: -33.8786,
};
const zoomStart = 20; // I found out that it is effective from level 4 onwards.
const zoomEnd = 20; // inclusive

const version = 'i.342'; // Extract from Google Earth HTTP calls to urlBase
const timeCode = 'fc361'; // Extract from end of Google Earth HTTP call

const dtAcquision = new Date('2017-11-01');
const pathOutput = 'out';

const keyFile = 'dbRoot.v5';

const rcValidBounds = {
	left: -180.0,
	right: 180.0,
	top: 180.0,
	bottom: -180.0,
};

function getTileSubAddress(x, y) {
	const subCol = x % 2;
	const subRow = y % 2;
	return (subCol | (subRow << 1)) ^ subRow;
}

function calculateTileAddress(lat, lon, zoom) {
	let s = '';
	for (let z = 0; z <= zoom; z++) {
		const zoomPower = Math.pow(2, z);
		const tileGeoSize = 360 / zoomPower;
		const x = Math.floor((lon - rcValidBounds.left) / tileGeoSize);
		const y = Math.floor((lat - rcValidBounds.bottom) / tileGeoSize);

		s += getTileSubAddress(x, y);
	}

	return s;
}

function decrypt(content, key) {
	let j = 16;
	for (let i = 0; i < content.length; i++) {
		content[i] ^= key[j + 8];
		j++;
		if (j % 8 === 0) {
			j += 16;
		}
		if (j >= 1016) {
			j = (j + 8) % 24;
		}
	}
	return content;
}

async function exists(filename) {
	try {
		await access(filename, constants.R_OK);
		return true;
	} catch (e) {
		return false;
	}
}

async function main() {
	const key = await readFile(keyFile);

	try {
		await mkdir(`${pathOutput}/cache`, { recursive: true });
	} catch (e) {
		console.error('Unable to access output path.');
		process.exit(1);
	}

	let limitDownloads = 386;
	let skipped = 0;

	for (let zoom = zoomStart; zoom <= zoomEnd; zoom++) {
	// Get the geographic size of the tile at the specified level.
		const zoomPower = Math.pow(2, zoom);
		const tileGeoSize = 360 / zoomPower;

		const colLeft = Math.floor((rcBound.left - rcValidBounds.left) / tileGeoSize);
		const colCount = Math.ceil((rcBound.right - rcBound.left) / tileGeoSize);
		const rowBottom = Math.floor((rcBound.bottom - rcValidBounds.bottom) / tileGeoSize);
		const rowCount = Math.ceil((rcBound.top - rcBound.bottom) / tileGeoSize);

		const progressTotal = rowCount * colCount;
		let progressCurrent = 0;

		//const boundLeft = rcBound.left;
		//const boundBottom = rcBound.bottom;
		const boundLeft = colLeft * tileGeoSize + rcValidBounds.left;
		const boundBottom = rowBottom * tileGeoSize + rcValidBounds.bottom;
		const xtileStart = Math.floor(zoomPower * ((boundLeft + 180) / 360));
		const lat_rad = boundBottom * Math.PI / 180;
		const ytileStart = Math.floor(zoomPower * (1 - (Math.log(Math.tan(lat_rad) + (1 / Math.cos(lat_rad))) / Math.PI)) / 2);

		console.log(`# Zoom level ${zoom}`);
		console.log(`  - ${colCount} cols [${colLeft}..${colLeft + colCount}], XYZ [${xtileStart}..${xtileStart + colCount}]`);
		console.log(`  - ${rowCount} rows [${rowBottom}..${rowBottom + rowCount}], XYZ [${ytileStart}..${ytileStart + rowCount}]`);
		console.log(`${progressTotal} tiles total`);

		for (let x = 0; x < colCount; x++) {
			let promises = [];
			for (let y = 0; y < rowCount; y++) {
				promises.push((async () => {
					progressCurrent++;

					const xtile = xtileStart + x;
					const ytile = ytileStart - y;
					const outPath = `${pathOutput}/${zoom}/${xtile}/${ytile}.jpg`;

					console.log(`> Processing ${progressCurrent}/${progressTotal}: XYZ ${xtile},${ytile}`);
					if (await exists(outPath)) {
						console.log('  - Tile already decoded, skipping download.');
						return;
					}

					const dStartLon = (colLeft + x) * tileGeoSize + rcValidBounds.left;
					const dStartLat = (rowBottom + y) * tileGeoSize + rcValidBounds.bottom;
					const tileAddress = calculateTileAddress(dStartLat, dStartLon, zoom);

					const filenameTile = `f1-${tileAddress}-${version}-${timeCode}`;
					const cacheFilename = `${pathOutput}/cache/${filenameTile}`;
					if (!await exists(cacheFilename)) {
						// Need to download file.
						if (limitDownloads > 0) {
							const urlTile = `${urlBase}&${filenameTile}`;
							console.log(`  - Downloading ${urlTile}`);

							const dl = await fetch(urlTile);
							limitDownloads--;
							if (!dl.ok) {
								throw new Error(`Download failed for ${urlTile} - HTTP ${dl.status} ${dl.statusText}`);
							}
							const data = await dl.bytes();
							await writeFile(cacheFilename, data);
						} else {
							skipped++;
							console.log('  - Skipping, max download limit reached');
							return;
						}

					} else {
						console.log('  - Tile already downloaded.');
					}

					const tileData = await readFile(cacheFilename);
					await mkdir(`${pathOutput}/${zoom}/${xtile}`, { recursive: true });
					decrypt(tileData, key);
					await writeFile(outPath, tileData);
					console.log(`  - Saved to ${outPath}`);
				})());
			} // for y
			await Promise.all(promises);
		} // for x
	}

	console.log(`${skipped} skipped downloads outstanding`);
}

async function test() {
	assert.equal(getTileSubAddress(0, 0), '0');
	assert.equal(getTileSubAddress(1, 0), '1');
	assert.equal(getTileSubAddress(0, 1), '3');
	assert.equal(getTileSubAddress(1, 1), '2');

	assert.equal(calculateTileAddress(-33.457923889160156, 151.1445083618164, 20), '012202011012213120030');
}

test();
main();
