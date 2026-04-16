export function normalizeReleaseVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("v") || trimmed.startsWith("V")
    ? trimmed.slice(1)
    : trimmed;
}

function toNumericParts(version: string): number[] {
  return normalizeReleaseVersion(version)
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function isNewerReleaseVersion(
  currentVersion: string,
  releaseVersion: string,
): boolean {
  const currentParts = toNumericParts(currentVersion);
  const releaseParts = toNumericParts(releaseVersion);
  const length = Math.max(currentParts.length, releaseParts.length);

  for (let index = 0; index < length; index += 1) {
    const current = currentParts[index] ?? 0;
    const release = releaseParts[index] ?? 0;

    if (release > current) return true;
    if (release < current) return false;
  }

  return false;
}
