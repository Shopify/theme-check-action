import { exec } from "@actions/exec";
import * as semver from "semver";
import { runChecksJson } from "./runChecksJson";

const MIN_VERSION = "3.50.0";
const MAX_THEME_VERSION = "3.59.0";

export async function installCli(version?: string) {
  const versionSuffix = version ? `@${version}` : "";

  if (!isValidVersion(version)) {
    throw new Error(
      `Shopify CLI version: ${version} is invalid or smaller than ${MIN_VERSION}`
    );
  }

  await exec(
    "npm",
    [
      "install",
      "--no-package-lock",
      "--no-save",
      `@shopify/cli${versionSuffix}`,
      shouldIncludeTheme(version) ? `@shopify/theme${versionSuffix}` : "",
    ].filter(Boolean)
  );

  const waiting = await exec(`npm list @shopify/cli`);
  console.log({ waiting });
}

function shouldIncludeTheme(version?: string) {
  if (!version || version.includes("experimental")) {
    return false;
  }

  if (!semver.valid(version)) {
    return false;
  }

  if (
    semver.gte(version, MIN_VERSION) &&
    semver.lt(version, MAX_THEME_VERSION)
  ) {
    return true;
  }

  return false;
}

function isValidVersion(version?: string): boolean {
  if (!version || version.includes("experimental")) {
    return true;
  }

  // Check if the version is valid
  if (!semver.valid(version)) {
    return false;
  }

  // Check if the version is greater than or equal to the minimum version
  if (!semver.gte(version, MIN_VERSION)) {
    return false;
  }

  return true;
}
