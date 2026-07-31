export interface VersionedRecord {
  version: string;
  isActive: boolean;
}

/**
 * Compares two semver strings numerically.
 *
 * Returns a negative number when `a` sorts before `b`, positive when after,
 * zero when equal — the shape `Array.prototype.sort` wants.
 *
 * The reason this exists rather than a string compare: lexicographically,
 * "1.0.10" sorts *before* "1.0.9", because "1" < "9" at the third character.
 * A registry that picked the highest version by string compare would keep
 * serving 1.0.9 forever, and would do so silently — the wrong agent version
 * produces plausible output, not an error.
 *
 * Pre-release suffixes ("1.0.0-beta.1") are compared as a trailing string, with
 * an absent suffix sorting *after* a present one, per semver: 1.0.0 is a later
 * release than 1.0.0-beta.1. Build metadata after "+" is ignored, also per
 * semver, because it is explicitly not part of version precedence.
 */
export function compareSemver(a: string, b: string): number {
  const parsed = [a, b].map(parseSemver);
  const [left, right] = parsed as [ParsedVersion, ParsedVersion];

  for (let index = 0; index < 3; index += 1) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (difference !== 0) return difference;
  }

  // Equal cores. A version with no pre-release outranks one with it.
  if (!left.prerelease && !right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease < right.prerelease ? -1 : left.prerelease > right.prerelease ? 1 : 0;
}

interface ParsedVersion {
  core: number[];
  prerelease: string | null;
}

function parseSemver(version: string): ParsedVersion {
  const withoutBuild = version.split("+")[0] ?? "";
  const [core, ...prereleaseParts] = withoutBuild.split("-");
  const numbers = (core ?? "").split(".").map((part) => {
    const value = Number.parseInt(part, 10);
    // A non-numeric segment becomes 0 rather than NaN. NaN would make every
    // comparison return NaN, and `sort` would silently produce an arbitrary
    // order — a much worse failure than treating "1.x.0" as "1.0.0".
    return Number.isFinite(value) ? value : 0;
  });
  return { core: numbers, prerelease: prereleaseParts.length > 0 ? prereleaseParts.join("-") : null };
}

/**
 * Picks the highest active version, or null when none is active.
 *
 * Inactive rows are filtered before the comparison rather than sorted and
 * skipped afterwards, so "deactivate 2.0.0 to roll back to 1.9.0" does exactly
 * what it says. That is the operational point of the isActive flag: turning an
 * agent version off without a deploy.
 */
export function selectActiveVersion<T extends VersionedRecord>(records: readonly T[]): T | null {
  const active = records.filter((record) => record.isActive);
  if (active.length === 0) return null;

  return active.reduce((highest, candidate) =>
    compareSemver(candidate.version, highest.version) > 0 ? candidate : highest
  );
}
