import { join, basename } from "bun:path";
import { renameLocalApk } from "./apk";
import ora from 'ora';

const BLOSSOM_DIR = Bun.env.BLOSSOM_DIR ?? '/tmp';

export const parseFromGithub = async (repo, relay, apkRegex, fetchApk, pullMetadata) => {
  const headers = Bun.env.GITHUB_TOKEN ? { Authorization: `Bearer ${Bun.env.GITHUB_TOKEN}` } : {};
  let repoJson;
  const repoUrl = `https://api.github.com/repos/${repo}`;
  if (pullMetadata) {
    const metadataSpinner = ora(`Pulling metadata from ${repoUrl}...`).start();

    repoJson = await (await fetch(repoUrl, { headers })).json();
    metadataSpinner.succeed('Pulled metadata from Github');
  }

  let apk;
  let latestReleaseJson;
  if (fetchApk) {
    const apkSpinner = ora(`Fetching APK...`).start();
    const latestReleaseUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    latestReleaseJson = await (await fetch(latestReleaseUrl, { headers })).json();

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
      apkSpinner.fail();
      throw `No APKs in ${repo}, I'm done here`;
    }

    const matchingApkAssetNames = apkAssetArray.map(a => a.name).filter(n => new RegExp(apkRegex).test(n));
    if (matchingApkAssetNames.length !== 1) {
      apkSpinner.fail();
      throw `Invalid regex matching multiple: ${matchingApkAssetNames}`;
    }
    const asset = latestReleaseJson.assets.find(a => a.name == matchingApkAssetNames[0]);

    const apkName = asset.name;
    const apkUrl = asset.browser_download_url;

    // // Check if we already processed this release
    // const metadataOnRelay = await querySync(relay, { 'kinds': [1063], 'search': apkUrl });
    // // Search is full-text (not exact) so we double-check
    // const metadataOnRelayCheck = metadataOnRelay.find(m => m.tags.find(t => t[0] == 'url')[1] == apkUrl);
    // if (metadataOnRelayCheck) {
    //   if (!Bun.env.OVERWRITE) {
    //     throw `Metadata for latest ${repo} release already in relay, nothing to do`;
    //   }
    // }

    // APK
    const tempApkPath = join(BLOSSOM_DIR, basename(apkUrl));
    await Bun.write(tempApkPath, await fetch(apkUrl, { headers }));
    apk = await renameLocalApk(tempApkPath, relay);
    apkSpinner.succeed(`Downloaded APK: ${apkName}`);
  }

  const result = {};

  if (repoJson) {
    result.app = {
      name: repoJson.name,
      description: repoJson.description,
      homepage: repoJson.homepage,
      repository: `https://github.com/${repo}`,
      license: repoJson.license?.spdx_id,
      tags: repoJson.topics.map(t => ['t', t]),
      starCount: repoJson.stargazers_count ?? repoJson.watchers_count ?? repoJson.watchers,
      forkCount: repoJson.forks_count ?? repoJson.forks,
    };
  }
  if (latestReleaseJson) {
    result.apk = apk;
    result.release = {
      text: latestReleaseJson.body,
      tagName: latestReleaseJson.tag_name,
      createdAt: latestReleaseJson.created_at,
      url: latestReleaseJson.html_url
    };
  }
  return result;
};