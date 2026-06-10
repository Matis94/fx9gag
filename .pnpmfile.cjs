// The @kxalex/node-html-parser fork depends on @kxalex/css-select via a
// `github:` shorthand, which pnpm resolves to a `git+https` virtual-store
// directory whose name contains a literal `#<commit>`. Vite 8 / rolldown
// (used by Vitest 4) treats `#` as a URL fragment and truncates the path,
// so it fails to resolve css-select's `lib/index.js`. Rewriting the dep to
// the equivalent codeload tarball resolves it to a `#`-free directory.
function readPackage(pkg) {
	if (
		pkg.name === '@kxalex/node-html-parser' &&
		pkg.dependencies &&
		pkg.dependencies['@kxalex/css-select']
	) {
		pkg.dependencies['@kxalex/css-select'] =
			'https://codeload.github.com/kxalex/css-select/tar.gz/22cdfa41660e567fd88bce30ac9e3083724a7b7d';
	}
	return pkg;
}

module.exports = { hooks: { readPackage } };
