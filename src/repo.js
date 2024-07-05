import { join, basename } from "bun:path";
import { renameToHash, selectBestString, querySync } from './util';
import { $ } from "bun";

const overwrite = Bun.env.OVERWRITE;

export const parseFromGithub = async (repo, relay) => {
  console.log('- Processing repository', repo, '...');
  const headers = Bun.env.GITHUB_TOKEN ? { Authorization: `Bearer ${Bun.env.GITHUB_TOKEN}` } : {};

  const repoUrl = `https://api.github.com/repos/${repo}`;
  const repoJson = await (await fetch(repoUrl, { headers })).json();

  const latestReleaseUrl = `https://api.github.com/repos/${repo}/releases/latest`;
  let latestReleaseJson = await (await fetch(latestReleaseUrl, { headers })).json();

  // If there's a message it's an error
  if (latestReleaseJson.message) {
    const rs = await (await fetch(`https://api.github.com/repos/${repo}/releases`, { headers })).json();
    if (rs.message || rs.length === 0) {
      throw `Error ${rs.message} for ${repo}, I'm done here`;
    }
    rs.sort((a, b) => b.created_at.localeCompare(a.created_at));
    latestReleaseJson = rs[0];
  }

  const apkAssetArray = latestReleaseJson.assets.filter(a => {
    return a.content_type == 'application/vnd.android.package-archive';
  });

  if (apkAssetArray.length === 0) {
    throw `No APKs in ${repo}, I'm done here`;
  }

  // TODO check against `apkRegexps` now (NOTE that it supports only ONE at the moment)
  // when variants ready: apkRegexps (plural) and here use @inquirer/checkbox for multi-select instead
  // (in prompt give example of a regex)

  const bestApkAssetName = selectBestString(apkAssetArray.map(a => a.name), [
    [/google/, -3],
    [/play/, -2],
    [/v7a/, -3],
    [/unsigned/, -1],
    [/fdroid/, -1],
    [/arm64/, 3],
    [/universal/, 1],
  ]);
  const asset = latestReleaseJson.assets.find(a => a.name == bestApkAssetName);

  const apkName = asset.name;
  const apkUrl = asset.browser_download_url;

  console.log('- Found best APK', apkName);

  // Check if we already processed this release
  const metadataOnRelay = await querySync(relay, { 'kinds': [1063], 'search': apkUrl });
  // Search is full-text (not exact) so we double-check
  const metadataOnRelayCheck = metadataOnRelay.find(m => m.url == apkUrl);
  if (metadataOnRelayCheck) {
    if (!overwrite) {
      throw `Metadata for latest ${repo} release already in relay, aborting`;
    }
  }

  // APK
  const blossomDir = Bun.env.BLOSSOM_DIR ?? '/tmp';
  $.cwd(blossomDir);
  const tempApkPath = join(blossomDir, basename(apkUrl));
  await Bun.write(tempApkPath, await fetch(apkUrl, { headers }));
  const [apkHash, apkPath] = await renameToHash(tempApkPath);

  console.log('Processing APK at', apkPath);

  // Now with the hash, check again for existence
  const filesOnRelay = await querySync(relay, { 'kinds': [1063], '#x': [apkHash] });
  if (filesOnRelay.length > 0) {
    if (!overwrite) {
      throw `Hash for latest ${repo} release already in relay, aborting`;
    }
  }

  return {
    appFromRepo: {
      name: repoJson.name,
      description: repoJson.description,
      Homepage: repoJson.homepage,
      repository: `https://github.com/${repo}`,
      license: repoJson.license?.spdx_id,
      tags: repoJson.topics.map(t => ['t', t]),
      starCount: repoJson.stargazers_count ?? repoJson.watchers_count ?? repoJson.watchers,
      forkCount: repoJson.forks_count ?? repoJson.forks,
    },
    apkFromRepo: {
      name: apkName,
      url: apkUrl,
      path: apkHash,
      hash: apkHash,
    },
    releaseFromRepo: {
      text: latestReleaseJson.body,
      tagName: latestReleaseJson.tag_name,
      createdAt: latestReleaseJson.created_at,
      url: latestReleaseJson.html_url
    }
  };
};

export const parseFromGitlab = async (repo) => {
  console.log('- Processing repository', repo, '...');

  const repoUrl = `https://gitlab.com/api/v4/projects/${decodeURIComponent(repo)}`;
  const repoJson = await (await fetch(repoUrl, { headers })).json();

  const latestReleaseUrl = `https://gitlab.com/api/v4/projects/${decodeURIComponent(repo)}/releases/permalink/latest`;
  let latestReleaseJson = await (await fetch(latestReleaseUrl, { headers })).json();

  // If there's a message it's an error
  // if (latestReleaseJson.message) {
  //   const rs = await (await fetch(`https://api.github.com/repos/${repo}/releases`, { headers })).json();
  //   if (rs.message || rs.length === 0) {
  //     throw `Error ${rs.message} for ${repo}, I'm done here`;
  //   }
  //   rs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  //   latestReleaseJson = rs[0];
  // }

  const apkAssetArray = latestReleaseJson.assets.filter(a => {
    return a.content_type == 'application/vnd.android.package-archive';
  });

  if (apkAssetArray.length === 0) {
    throw `No APKs in ${repo}, I'm done here`;
  }

  // TODO should specify correct APK pattern in apps.yaml, if not, use this
  const bestApkAssetName = selectBestString(apkAssetArray.map(a => a.name), [
    [/google/, -3],
    [/play/, -2],
    [/v7a/, -3],
    [/unsigned/, -1],
    [/fdroid/, -1],
    [/arm64/, 3],
    [/universal/, 1],
  ]);
  const asset = latestReleaseJson.assets.find(a => a.name == bestApkAssetName);
  console.log('- Found best APK', asset.name);
};