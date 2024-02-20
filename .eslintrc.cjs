/**
 * @type {import('@types/eslint').Linter.BaseConfig}
 */
module.exports = {
	extends: ['kentcdodds'],
	parserOptions: {
		project: require.resolve('./other/tsconfig.json'),
	},
	rules: {
		'@typescript-eslint/no-explicit-any': 'off',
	},
}
