#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const isPublished = !fs.existsSync(path.join(__dirname, '..', 'app'))
const argv = process.argv.slice(2)

if (argv[0] !== 'start') {
	throw new Error('Only `start` is supported currently...')
}

if (process.env.NODE_ENV === 'production' || isPublished) {
	exec('node ./start.js', {
		KCDSHOP_CONTEXT_CWD: process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd(),
		NODE_ENV: 'production',
	}).catch(code => {
		process.exit(code)
	})
} else {
	exec('npx nx @kentcdodds/workshop-app:dev', {
		KCDSHOP_CONTEXT_CWD: process.env.KCDSHOP_CONTEXT_CWD ?? process.cwd(),
	}).catch(code => {
		process.exit(code)
	})
}

async function exec(command, envVars) {
	const child = spawn(command, {
		shell: true,
		cwd: path.join(__dirname, '..'),
		stdio: 'inherit',
		env: {
			...process.env,
			...envVars,
		},
	})
	await new Promise((res, rej) => {
		child.on('exit', code => {
			if (code === 0) {
				res(code)
			} else {
				rej(code)
			}
		})
	})
}
