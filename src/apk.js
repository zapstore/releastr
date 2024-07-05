import { join, basename, extname } from "bun:path";
import { renameToHash, selectBestString } from './util';
import { $ } from "bun";

export const extractFromApk = async (apkPath) => {
  const blossomDir = Bun.env.BLOSSOM_DIR ?? '/tmp';
  $.cwd(blossomDir);

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

  if (!iconPath) {
    // TODO prevent XML image shit
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
        const iconFolder = join(apkFolder, 'res', bestMipmapFolder);
        const _iconName = await $`ls ${iconBasename}.*'`.cwd(iconFolder).text();
        iconPath = join(iconFolder, _iconName.trim());
      }
    } catch (e) {
      // ignore
    }
  }

  console.log('Cleaning up folder', apkFolder);
  await $`rm -fr $FOLDER'`.env({ FOLDER: apkFolder }).text();

  return {
    apkSize
  };
};