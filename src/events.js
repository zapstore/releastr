import { getPublicKey } from 'nostr-tools';
import { decode } from 'nostr-tools/nip19';
import { finalizeEvent } from 'nostr-tools/pure';

export const produceEvents = async (app, fileMetadata, release, nsec) => {
  let pubkey;
  if (nsec) {
    pubkey = decode(getPublicKey(nsec)).data;
  } else if (app.npub?.trim()) {
    pubkey = decode(app.npub.trim()).data;
  }

  // 0

  // TODO check for kind 0, does it have x509 from APK?
  // if not, generate new kind 0 ready to be signed

  // 32267

  const partialAppEvent = {
    kind: 32267,
    content: app.description,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', app.identifier],
      ['name', app.name],
      ...(app.repository ? [['repository', app.repository]] : []),
      // TODO RESTORE
      // ...(iconHashName ? [['icon', `https://cdn.zap.store/${iconHashName}`]] : []),
      // ...(imageHashNames.map(i => ['image', `https://cdn.zap.store/${i}`])),
      ...(app.homepage ? [['url', app.homepage]] : []),
      ...(pubkey ? [['p', pubkey], ['zap', pubkey, '1']] : []),
      ...app.tags,
      // TODO NOTE IMPORTANT: changed github_stars to stars (and forks)
      // ...(app.starCount !== undefined ? [['stars', String(appStarCount)]] : []),
      // ...(app.forkCount !== undefined ? [['forks', String(appForkCount)]] : []),
      ...(app.license ? [['license', appLicense]] : []),
    ]
  };

  const appEvent = nsec ? finalizeEvent(partialAppEvent, nsec) : partialAppEvent;

  // 1063

  let fileMetadataEvent;

  const partialMetadataEvent = {
    kind: 1063,
    content: `${app.name} ${fileMetadata.version || release.tagName}`,
    created_at: Date.parse(release.createdAt) / 1000,
    tags: [
      ['url', fileMetadata.url],
      ['m', 'application/vnd.android.package-archive'],
      ['x', fileMetadata.hash],
      ['size', fileMetadata.size],
      // TODO include app.identifier?
      ...(fileMetadata.version ? [['version', fileMetadata.version]] : []),
      ...(fileMetadata.versionCode ? [['version_code', fileMetadata.versionCode]] : []),
      ...(fileMetadata.minSdkVersion ? [['min_sdk_version', fileMetadata.minSdkVersion]] : []),
      ...(fileMetadata.targetSdkVersion ? [['target_sdk_version', fileMetadata.targetSdkVersion]] : []),
      ...fileMetadata.signatureHashes.map(h => ['apk_signature_hash', h]),
      ...fileMetadata.architectures.map(t => ['arch', t]),
      ...(app.repository ? [['repository', app.repository]] : []),
      // TODO RESTORE
      // ...(iconHashName ? [['image', `https://cdn.zap.store/${iconHashName}`]] : []),
      ...(pubkey ? [['p', pubkey], ['zap', pubkey, '1']] : [])
    ]
  };

  fileMetadataEvent = nsec ? finalizeEvent(partialMetadataEvent, nsec) : partialMetadataEvent;

  // 30063

  const partialReleaseEvent = {
    kind: 30063,
    content: release.text,
    created_at: Date.parse(release.createdAt) / 1000,
    tags: [
      ['d', `${app.identifier}@${release.tagName}`],
      ['url', release.url],
      ['e', fileMetadataEvent.id],
      ['a', `${appEvent.kind}:${appEvent.pubkey}:${fileMetadata.identifier}`],
    ]
  };

  const releaseEvent = nsec ? finalizeEvent(partialReleaseEvent, nsec) : partialReleaseEvent;

  return {
    appEvent,
    releaseEvent,
    fileMetadataEvent,
  };
};

export const signEvents = async (nsec) => {
  // TODO sign with nostr-tools and publish to relay.zap.store
};

export const publishEvents = async (appEvent, releaseEvent, metadataEvent) => {
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

  if (releaseEvent) {
    try {
      const r2 = await relay.publish(releaseEvent);
      console.log('kind 30063 published', releaseEvent.id, r2);
    } catch (e) {
      console.error('kind 30063 not published', releaseEvent.id);
      console.error(e.message);
    }
  }

  if (appEvent) {
    try {
      const r3 = await relay.publish(appEvent);
      console.log('kind 32267 published', appEvent.id, r3);
    } catch (e) {
      console.error('kind 32267 not published', appEvent.id);
      console.error(e.message);
    }
  }

};