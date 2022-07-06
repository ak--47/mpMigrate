let prog = require('./index.js')

async function dev() {
	let result = await prog();
	debugger;
}

dev()