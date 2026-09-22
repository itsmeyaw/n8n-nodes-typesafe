import { execFileSync } from 'node:child_process';

const packageFiles = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }))[0].files;
const allowed = [
	/^LICENSE$/,
	/^README\.md$/,
	/^package\.json$/,
	/^examples\/.*\.json$/,
	/^dist\/credentials\/.*\.js$/,
	/^dist\/nodes\/.*\.(?:js|json|svg)$/,
];
const unexpected = packageFiles.map(({ path }) => path).filter((path) => !allowed.some((pattern) => pattern.test(path)));

if (unexpected.length) {
	throw new Error(`Unexpected npm package files:\n${unexpected.join('\n')}`);
}
