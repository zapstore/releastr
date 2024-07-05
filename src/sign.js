import { decode } from 'nostr-tools/nip19';
import { finalizeEvent } from 'nostr-tools/pure';

export const signEvents = async (repo) => {

  const sk = Bun.env.SK;

  const pubkey = args.npub?.trim() ? decode(args.npub.trim()).data : undefined;

  // 32267

  const app = {
    kind: 32267,
    content: appDescription,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', appIdentifier],
      ['name', appName],
      ['repository', appRepository],
      ...(iconHashName ? [['icon', `https://cdn.zap.store/${iconHashName}`]] : []),
      ...(imageHashNames.map(i => ['image', `https://cdn.zap.store/${i}`])),
      ...(appHomepage ? [['url', appHomepage]] : []),
      ...(pubkey ? [['p', pubkey], ['zap', pubkey, '1']] : []),
      ...appTags,
      // TODO NOTE IMPORTANT: changed github_stars to stars (and forks)
      ...(appStarCount !== undefined ? [['stars', String(appStarCount)]] : []),
      ...(appForkCount !== undefined ? [['forks', String(appForkCount)]] : []),
      ...(appLicense ? [['license', appLicense]] : []),
    ]
  };

  const appEvent = finalizeEvent(app, sk);

  // 1063

  let metadataEvent;

  // Do not submit again a file with same hash
  if (filesOnRelay.length === 0) {
    const metadata = {
      kind: 1063,
      content: `${appName} ${apkVersion || releaseTagName}`,
      created_at: Date.parse(releaseCreatedAt) / 1000,
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
        ['repository', appRepository],
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

};