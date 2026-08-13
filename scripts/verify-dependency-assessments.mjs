#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const directSections = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
];

if (process.env.LIRNA_DEPENDENCY_PROJECT_ROOT)
	process.chdir(process.env.LIRNA_DEPENDENCY_PROJECT_ROOT);

async function main() {
	const [mode, ...args] = process.argv.slice(2);
	const revisions =
		mode === "--staged" ? { base: "HEAD", target: ":" } : range(args);
	if (/^0+$/.test(revisions.base)) {
		console.log(
			"dependency assessment verification skipped: the comparison base is empty",
		);
		return;
	}
	const [baseManifest, targetManifest, baseLock, targetLock] =
		await Promise.all([
			readJson(revisions.base, "package.json"),
			readJson(revisions.target, "package.json"),
			readJson(revisions.base, "package-lock.json"),
			readJson(revisions.target, "package-lock.json"),
		]);
	const additions = directAdditions(
		baseManifest,
		targetManifest,
		baseLock,
		targetLock,
	);

	for (const dependency of additions) {
		const assessment = await readJson(
			revisions.target,
			`config/dependency-decisions/${identity(dependency.name, dependency.version)}.assessment.json`,
		);
		if (!assessment) {
			throw new Error(
				`unassessed direct dependency ${dependency.name}@${dependency.version}; use npm run dependency:add -- ${dependency.name}@${dependency.version}`,
			);
		}
		validateAssessment(assessment, dependency);
		for (const override of assessment.requiredOverrides ?? []) {
			const record = await readJson(
				revisions.target,
				`config/dependency-decisions/${identity(dependency.name, dependency.version)}.${override.kind}.json`,
			);
			if (
				!record ||
				record.package !== dependency.name ||
				record.version !== dependency.version
			) {
				throw new Error(
					`assessment for ${dependency.name}@${dependency.version} requires its exact ${override.kind} record`,
				);
			}
			if (
				override.kind === "warnings" &&
				JSON.stringify([...(record.triggeredWarnings ?? [])].sort()) !==
					JSON.stringify([...(override.triggeredWarnings ?? [])].sort())
			) {
				throw new Error(
					`warning override for ${dependency.name}@${dependency.version} does not match assessment evidence`,
				);
			}
		}
	}
	console.log(
		`dependency assessment verification passed (${additions.length} new direct dependencies)`,
	);
}

function range(args) {
	if (args.length !== 2)
		throw new Error(
			"usage: verify-dependency-assessments.mjs --staged | --range BASE HEAD",
		);
	return { base: args[0], target: args[1] };
}

function directAdditions(
	baseManifest = {},
	targetManifest = {},
	baseLock = {},
	targetLock = {},
) {
	const base = directDependencies(baseManifest, baseLock);
	const target = directDependencies(targetManifest, targetLock);
	return [...target].flatMap(([name, dependency]) => {
		const installed = targetLock.packages?.[`node_modules/${name}`];
		if (!installed?.version) {
			throw new Error(
				`direct dependency ${name} is missing an exact lockfile package entry`,
			);
		}
		const previous = base.get(name);
		const changed =
			!previous ||
			previous.section !== dependency.section ||
			previous.spec !== dependency.spec ||
			previous.version !== installed.version ||
			previous.integrity !== installed.integrity;
		return changed
			? [
					{
						integrity: installed.integrity,
						name,
						section: dependency.section,
						version: installed.version,
					},
				]
			: [];
	});
}

function directDependencies(manifest, lock) {
	const root = lock.packages?.[""] ?? {};
	const result = new Map();
	for (const section of directSections) {
		for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
			const version = lock.packages?.[`node_modules/${name}`]?.version;
			const integrity = lock.packages?.[`node_modules/${name}`]?.integrity;
			result.set(name, { integrity, section, spec, version });
		}
		for (const [name, spec] of Object.entries(root[section] ?? {})) {
			if (!result.has(name))
				result.set(name, {
					integrity: lock.packages?.[`node_modules/${name}`]?.integrity,
					section,
					spec,
					version: lock.packages?.[`node_modules/${name}`]?.version,
				});
		}
	}
	return result;
}

function validateAssessment(record, dependency) {
	if (
		record.package !== dependency.name ||
		record.version !== dependency.version
	) {
		throw new Error(
			`assessment evidence does not match exact package ${dependency.name}@${dependency.version}`,
		);
	}
	if (record.integrity !== dependency.integrity) {
		throw new Error(
			`assessment evidence does not match lockfile integrity for ${dependency.name}@${dependency.version}`,
		);
	}
	if (record.section !== dependency.section) {
		throw new Error(
			`assessment evidence does not match dependency section for ${dependency.name}@${dependency.version}`,
		);
	}
	if (!Number.isFinite(new Date(record.assessmentDate).getTime())) {
		throw new Error(
			`assessment evidence for ${dependency.name}@${dependency.version} is malformed`,
		);
	}
}

async function readJson(revision, path) {
	try {
		const target = revision === ":" ? `:${path}` : `${revision}:${path}`;
		const { stdout } = await exec("git", ["show", target]);
		return JSON.parse(stdout);
	} catch (error) {
		if (error.code === 128) return undefined;
		throw error;
	}
}

function identity(name, version) {
	return `${encodeURIComponent(`${name}@${version}`).replaceAll("%40", "@")}`;
}

main().catch((error) => {
	console.error(
		`Dependency assessment verification failed: ${error instanceof Error ? error.message : error}`,
	);
	process.exitCode = 1;
});
