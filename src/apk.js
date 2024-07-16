import { parse } from 'yaml';
import { basename, extname, dirname, join } from "bun:path";
import { $ } from "bun";
import { renameToHash, querySync } from './util';
import ora from 'ora';

const BLOSSOM_DIR = Bun.env.BLOSSOM_DIR ?? '/tmp';

export const extractFromApk = async (apkPath, apkSignerPath) => {
  const _apkSize = await $`wc -c < $FILE`.env({ FILE: apkPath }).text();
  const apkSize = _apkSize.trim();

  const apkFolder = basename(apkPath).replace(extname(apkPath), '');
  const spinner = ora('Parsing APK for metadata...').start();
  await $`rm -fr $FOLDER'`.env({ FOLDER: apkFolder }).text();
  if (Bun.which('apkztool')) {
    await $`apktool d $APK`.env({ APK: apkPath }).quiet();
  } else {
    await $`unzip -o $APK -d $FOLDER`.env({ APK: apkPath, FOLDER: `/tmp/${apkFolder}` }).quiet();
  }
  spinner.text = 'Parsed APK for metadata';
  spinner.succeed();

  let architectures = ['arm64-v8a'];
  try {
    const _archs = await $`ls $FOLDER/lib`.env({ FOLDER: apkFolder }).text();
    architectures = _archs.trim().split('\n');
  } catch (_) {
    // if lib/ is not present, leave default and do nothing else
  }

  apkSignerPath = Bun.which('apksigner') ?? apkSignerPath;
  const _sigHashes = await $`$BINARY verify --print-certs $APK | grep SHA-256`.env({ BINARY: apkSignerPath, APK: apkPath }).text();
  const signatureHashes = [];
  for (const _sh of _sigHashes.trim().split('\n')) {
    const [_, hash] = _sh.split(':');
    if (hash) {
      signatureHashes.push(hash.trim());
    }
  }

  let appIdentifier, apkVersion, apkVersionCode, minSdkVersion, targetSdkVersion;
  if (Bun.which('apkztool')) {
    const _appIdentifier = await $`cat $MANIFEST | xq -q 'manifest' -a 'package'`.env({ MANIFEST: `${apkFolder}/AndroidManifest.xml` }).text();
    appIdentifier = _appIdentifier.trim();

    const apkToolYaml = await $`cat $YAML | sed '1d'`.env({ YAML: `${apkFolder}/apktool.yml` }).text();
    const yamlData = parse(apkToolYaml.trim());

    apkVersion = yamlData.versionInfo && yamlData.versionInfo.versionName;
    apkVersionCode = yamlData.versionInfo && yamlData.versionInfo.versionCode;

    minSdkVersion = yamlData.sdkInfo && yamlData.sdkInfo.minSdkVersion;
    targetSdkVersion = yamlData.sdkInfo && yamlData.sdkInfo.targetSdkVersion;

    // if (!iconPath) {
    //   // TODO prevent XML image shit
    //   try {
    //     const iconPointer = await $`cat $MANIFEST | xq -q 'manifest application' -a 'android:icon'`.env({ MANIFEST: `${apkFolder}/AndroidManifest.xml` }).text();
    //     if (iconPointer.startsWith('@mipmap')) {
    //       const mipmapFolders = await $`ls $FOLDER/res | grep mipmap`.env({ FOLDER: apkFolder }).text();
    //       const bestMipmapFolder = selectBestString(mipmapFolders.trim().split('\n'), [
    //         [/xxxhdpi/, 5],
    //         [/xxhdpi/, 4],
    //         [/xhdpi/, 3],
    //         [/hdpi/, 2],
    //         [/mdpi/, 1],
    //       ]);
    //       const iconBasename = iconPointer.replace('@mipmap/', '').trim();
    //       const iconFolder = join(apkFolder, 'res', bestMipmapFolder);
    //       const _iconName = await $`ls ${iconBasename}.*'`.cwd(iconFolder).text();
    //       iconPath = join(iconFolder, _iconName.trim());
    //     }
    //   } catch (e) {
    //     // ignore
    //   }
    // }

    // // TODO check appIcon, convert svg to png
    // const [_, iconHashName] = iconPath ? await renameToHash(iconPath) : [undefined, undefined];
  }

  // console.log('Cleaning up folder', apkFolder);
  await $`rm -fr $FOLDER'`.env({ FOLDER: apkFolder }).text();

  return {
    identifier: appIdentifier,
    size: apkSize,
    version: apkVersion,
    versionCode: apkVersionCode,
    architectures,
    minSdkVersion,
    targetSdkVersion,
    signatureHashes,
  };
};

export const renameLocalApk = async (path, relay) => {
  if (dirname(path) != BLOSSOM_DIR) {
    await $`cp $SRC $DEST`.env({ SRC: path, DEST: BLOSSOM_DIR }).quiet();
  }
  const [apkHash, apkPath] = await renameToHash(join(BLOSSOM_DIR, basename(path)));

  // Now with the hash, check again for existence
  // TODO RE ENABLE
  // const filesOnRelay = await querySync(relay, { 'kinds': [1063], '#x': [apkHash] });
  // if (filesOnRelay.length > 0) {
  //   if (!Bun.env.OVERWRITE) {
  //     throw `Hash for APK already in relay, nothing to do`;
  //   }
  // }

  return {
    path: apkPath,
    hash: apkHash,
  };
};