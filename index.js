import { $ } from "bun";
import { Relay } from 'nostr-tools/relay';
import { finalizeEvent } from 'nostr-tools/pure';
import { join, basename, extname } from "bun:path";
import { decode } from 'nostr-tools/nip19';
import { renameToHash, selectBestString, querySync } from './util';
import { parse } from 'yaml';

const yaml = await Bun.file(`${import.meta.dir}/apps.yaml`).text();

const sk = Bun.env.SK;
const blossomDir = Bun.env.BLOSSOM_DIR;
const overwrite = Bun.env.OVERWRITE;
const onlyProcess = Bun.env.ONLY_PROCESS;

if (!sk || !blossomDir) {
  console.error('Both SK and BLOSSOM_DIR must be provided');
  process.exit(1);
}

$.cwd(blossomDir);

const DEFAULT_RELAY = 'wss://relay.zap.store';
const relay = await Relay.connect(DEFAULT_RELAY);

const headers = Bun.env.GITHUB_TOKEN ? { Authorization: `Bearer ${Bun.env.GITHUB_TOKEN}` } : {};

const apps = parse(yaml);
let appValues = Object.values(apps);

if (onlyProcess) {
  const key = Object.keys(apps).find(k => k == onlyProcess);
  if (key) {
    appValues = [apps[key]];
  }
}

console.log(`Loading ${appValues.length} apps...`);

for (const args of appValues) {
  console.log('- Processing repository', args.github, '...');

  // Github
  const repoUrl = `https://api.github.com/repos/${args.github}`;
  const repoJson = await (await fetch(repoUrl, { headers })).json();

  const latestReleaseUrl = `https://api.github.com/repos/${args.github}/releases/latest`;
  let latestReleaseJson = await (await fetch(latestReleaseUrl, { headers })).json();

  // If there's a message it's an error
  if (latestReleaseJson.message) {
    const rs = await (await fetch(`https://api.github.com/repos/${args.github}/releases`, { headers })).json();
    if (rs.message || rs.length === 0) {
      console.log(`Error ${rs.message} for ${args.github}, I'm done here`);
      continue;
    }
    rs.sort((a, b) => b.created_at.localeCompare(a.created_at));
    latestReleaseJson = rs[0];
  }

  const apkAssetArray = latestReleaseJson.assets.filter(a => {
    return a.content_type == 'application/vnd.android.package-archive';
  });

  if (apkAssetArray.length === 0) {
    console.log(`No APKs in ${args.github}, I'm done here`);
    continue;
  }

  // TODO should specify correct APK pattern in apps.yaml
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

  // Check if we already processed this release
  const metadataOnRelay = await querySync(relay, { 'kinds': [1063], 'search': asset.browser_download_url });
  // Search is full-text (not exact) so we double-check
  const metadataOnRelayCheck = metadataOnRelay.find(m => m.browser_download_url == asset.browser_download_url);
  if (metadataOnRelayCheck) {
    if (!overwrite) {
      console.log(`Metadata for latest ${args.github} release already in relay, aborting`);
      continue;
    }
  }

  // APK
  const apkUrl = asset.browser_download_url;
  const tempApkPath = join(blossomDir, basename(apkUrl));
  await Bun.write(tempApkPath, await fetch(apkUrl, { headers }));
  const [apkHash, apkPath] = await renameToHash(tempApkPath);

  console.log('Processing APK at', apkPath);

  // Now with the hash, check again for existence
  const filesOnRelay = await querySync(relay, { 'kinds': [1063], '#x': [apkHash] });
  if (filesOnRelay.length > 0) {
    if (!overwrite) {
      console.log(`Hash for latest ${args.github} release already in relay, aborting`);
      continue;
    }
  }

  const _apkSize = await $`wc -c < $FILE`.env({ FILE: apkPath }).text();
  const apkSize = _apkSize.trim();

  const apkFolder = basename(apkPath).replace(extname(apkPath), '');
  await $`rm -fr $FOLDER'`.env({ FOLDER: apkFolder }).text();
  await $`apktool d $APK'`.env({ APK: basename(apkPath) }).quiet();

  let archs = ['arm64-v8a'];
  try {
    const _archs = await $`ls $FOLDER/lib`.env({ FOLDER: apkFolder }).text();
    archs = _archs.trim().split('\n');
  } catch (_) {
    // if lib/ is not present, leave default and do nothing else
  }

  const _sigHashes = await $`apksigner verify --print-certs $APK | grep SHA-256`.env({ APK: basename(apkPath) }).text();
  const sigHashes = [];
  for (const _sh of _sigHashes.trim().split('\n')) {
    const [_, hash] = _sh.split(':');
    if (hash) {
      sigHashes.push(hash.trim());
    }
  }

  const _appIdentifier = await $`cat $MANIFEST | xq -q 'manifest' -a 'package'`.env({ MANIFEST: `${apkFolder}/AndroidManifest.xml` }).text();
  const appIdentifier = _appIdentifier.trim();
  if (appIdentifier) {
    console.log('- Found app identifier', appIdentifier);
  }

  const apkToolYaml = await $`cat $YAML | sed '1d'`.env({ YAML: `${apkFolder}/apktool.yml` }).text();
  const yamlData = parse(apkToolYaml.trim());

  const apkVersion = yamlData.versionInfo && yamlData.versionInfo.versionName;
  const apkVersionCode = yamlData.versionInfo && yamlData.versionInfo.versionCode;
  if (apkVersion) {
    console.log('- Found app version', apkVersion, apkVersionCode);
  }

  const minSdkVersion = yamlData.sdkInfo && yamlData.sdkInfo.minSdkVersion;
  const targetSdkVersion = yamlData.sdkInfo && yamlData.sdkInfo.targetSdkVersion;

  // Scrape name, description, icon, images from Google Play Store

  const url = `https://play.google.com/store/apps/details?id=${appIdentifier}`;

  const playStoreHTML = Buffer.alloc(1.5 * 1024 * 1024);
  await $`curl -s $URL > ${playStoreHTML}`.env({ URL: url });

  const playStoreAvailable = !playStoreHTML.toString().includes('not found');

  let name = args.name;
  let description = args.description;
  let iconPath;
  const imageHashNames = [];

  if (iconPath) {
    // TODO allow passing icon via arg
    // https://raw.githubusercontent.com/stsaz/phiola/main/res/phiola.svg
    // also convert svg to png
  }

  if (playStoreAvailable) {
    const _name = await $`cat < ${playStoreHTML} | xq -q 'h1[itemprop=name]'`.text();
    name ||= _name.trim();
    console.log('- Found name', name);

    const _description = await $`cat < ${playStoreHTML} | xq -n -q 'div[data-g-id=description]' | pandoc -f html --wrap=none -t markdown | sed '1d;$d''`.text();
    description ||= _description.replaceAll('\\\n', '\n');

    const _iconUrls = await $`cat < ${playStoreHTML} | xq -q 'img[itemprop=image]' -a 'src'`.text();
    const iconUrl = _iconUrls.trim().split('\n')[0];

    const _imageUrls = await $`cat < ${playStoreHTML} | xq -q 'img[data-screenshot-index]' -a 'src'`.text();
    const imageUrls = _imageUrls.trim().split('\n');

    for (const imageUrl of imageUrls) {
      if (imageUrl.trim()) {
        const tempImagePath = join(blossomDir, basename(imageUrl));
        await Bun.write(tempImagePath, await fetch(imageUrl));
        const [_, imageHashName] = await renameToHash(tempImagePath);
        imageHashNames.push(imageHashName);
      }
    }
    console.log('- Found images', imageHashNames.join(', '));

    if (!iconPath && iconUrl.trim()) {
      iconPath = join(blossomDir, basename(iconUrl));
      await Bun.write(iconPath, await fetch(iconUrl));
    }
  } else {
    if (!iconPath) {
      try {
        const iconPointer = await $`cat $MANIFEST | xq -q 'manifest application' -a 'android:icon'`.env({ MANIFEST: `${apkFolder}/AndroidManifest.xml` }).text();
        if (iconPointer.startsWith('@mipmap')) {
          const mipmapFolders = await $`ls $FOLDER/res | grep mipmap`.env({ FOLDER: apkFolder }).text();
          const bestMipmapFolder = selectBestString(mipmapFolders.trim().split('\n'), [
            [/xxxhdpi/, 5],
            [/xxhdpi/, 4],
            [/xhdpi/, 3],
            [/hdpi/, 2],
            [/mdpi/, 1],
          ]);
          const iconBasename = iconPointer.replace('@mipmap/', '').trim();
          const iconFolder = join(blossomDir, apkFolder, 'res', bestMipmapFolder);
          const _iconName = await $`ls ${iconBasename}.*'`.cwd(iconFolder).text();
          iconPath = join(iconFolder, _iconName.trim());
        }
      } catch (e) {
        // ignore
      }
    }
  }

  name ||= repoJson.name || args.github;
  description ||= repoJson.description || "";

  const [_, iconHashName] = iconPath ? await renameToHash(iconPath) : [undefined, undefined];
  if (iconHashName) {
    console.log('- Found icon', iconHashName);
  }

  const pubkey = args.npub?.trim() ? decode(args.npub.trim()).data : undefined;

  // 32267

  const stars = repoJson.stargazers_count ?? repoJson.watchers_count ?? repoJson.watchers;
  const forks = repoJson.forks_count ?? repoJson.forks;
  const appTags = repoJson.topics.map(t => ['t', t]);
  const license = repoJson.license?.spdx_id;

  const app = {
    kind: 32267,
    content: description,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', appIdentifier],
      ['name', name],
      ['repository', `https://github.com/${args.github}`],
      ...(iconHashName ? [['icon', `https://cdn.zap.store/${iconHashName}`]] : []),
      ...(imageHashNames.map(i => ['image', `https://cdn.zap.store/${i}`])),
      ...(repoJson.homepage ? [['url', repoJson.homepage]] : []),
      ...(pubkey ? [['p', pubkey], ['zap', pubkey, '1']] : []),
      ...appTags,
      ...(stars !== undefined ? [['github_stars', String(stars)]] : []),
      ...(forks !== undefined ? [['github_forks', String(forks)]] : []),
      ...(license ? [['license', license]] : []),
    ]
  };

  const appEvent = finalizeEvent(app, sk);

  // 1063

  let metadataEvent;

  // Do not submit again a file with same hash
  if (filesOnRelay.length === 0) {
    const metadata = {
      kind: 1063,
      content: `${name} ${apkVersion || latestReleaseJson.tag_name}`,
      created_at: Date.parse(latestReleaseJson.created_at) / 1000,
      tags: [
        ['url', apkUrl],
        ['m', 'application/vnd.android.package-archive'],
        ['x', apkHash],
        ['size', apkSize],
        ...(apkVersion ? [['version', apkVersion]] : []),
        ...(apkVersionCode ? [['version_code', apkVersionCode]] : []),
        ...(minSdkVersion ? [['min_sdk_version', minSdkVersion]] : []),
        ...(targetSdkVersion ? [['target_sdk_version', targetSdkVersion]] : []),
        ...sigHashes.map(h => ['apk_signature_hash', h]),
        ...archs.map(t => ['arch', t]),
        ['repository', `https://github.com/${args.github}`],
        ...(iconHashName ? [['image', `https://cdn.zap.store/${iconHashName}`]] : []),
        ...(pubkey ? [['p', pubkey], ['zap', pubkey, '1']] : [])
      ]
    };

    metadataEvent = finalizeEvent(metadata, sk);
  }

  // 30063

  const release = {
    kind: 30063,
    content: latestReleaseJson.body,
    created_at: Date.parse(latestReleaseJson.created_at) / 1000,
    tags: [
      ['d', `${appIdentifier}@${latestReleaseJson.tag_name}`],
      ['url', latestReleaseJson.html_url],
      ['e', metadataEvent.id],
      ['a', `${appEvent.kind}:${appEvent.pubkey}:${appIdentifier}`],
    ]
  };

  const releaseEvent = finalizeEvent(release, sk);

  console.log('Publishing to', DEFAULT_RELAY, '...');

  if (metadataEvent) {
    try {
      const r1 = await relay.publish(metadataEvent);
      console.log('kind 1063 published', metadataEvent.id, r1);
    } catch (e) {
      console.error('kind 1063 not published', metadataEvent.id);
      console.error(e.message);
    }
  }

  try {
    const r2 = await relay.publish(releaseEvent);
    console.log('kind 30063 published', releaseEvent.id, r2);
  } catch (e) {
    console.error('kind 30063 not published', releaseEvent.id);
    console.error(e.message);
  }

  try {
    const r3 = await relay.publish(appEvent);
    console.log('kind 32267 published', appEvent.id, r3);
  } catch (e) {
    console.error('kind 32267 not published', appEvent.id);
    console.error(e.message);
  }

  console.log('Cleaning up folder', apkFolder);
  await $`rm -fr $FOLDER'`.env({ FOLDER: apkFolder }).text();

  await Bun.sleep(2000);
}

await relay.close();