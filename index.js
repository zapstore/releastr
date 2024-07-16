import chalk from 'chalk';
import { parse } from 'yaml';
import { doWithRelay } from './src/util';
import { parseFromGithub } from './src/repo';
import { extractFromApk } from "./src/apk";
import { parseFromPlayStore as parseFromPlayStore } from "./src/store";
import { produceEvents, signEvents } from "./src/events";
import { $ } from "bun";
import { password, select, input, confirm } from '@inquirer/prompts';
import { renameLocalApk } from "./src/apk";
import minimist from 'minimist';

// Load metadata from zapstore.yaml
// TODO create file if not exists
const file = `${import.meta.dir}/zapstore.yaml`;
await $`touch $FILE`.env({ FILE: file });
const yamlText = await Bun.file(file).text();
const appObjects = parse(yamlText) ?? {};

const argv = minimist(process.argv.slice(2));

await doWithRelay('wss://relay.zap.store', async (relay) => {
  for (const [appAlias, appObj] of Object.entries(appObjects)) {
    for (const [os, app] of Object.entries(appObj)) {

      if (os == 'android') {
        if (Bun.env.ONLY_PROCESS && Bun.env.ONLY_PROCESS != appAlias) {
          continue;
        }

        const fileMetadata = {};
        const release = {};
        const cryptographicIdentity = {};

        let apkPath = argv.apk;
        if (apkPath) {
          await renameLocalApk(apkPath, relay);
        }
        app.tags ??= [];

        console.log(`Releasing ${chalk.bold(app.name ?? appAlias)} Android app${apkPath ? ` (from ${apkPath})` : ''}...`);

        if (!app.repository) {
          const repo = await input({
            message: `Input the source repository for ${app.name ?? appAlias} (blank for none):`
          });
          app.repository = repo.trim();
        }

        if (!apkPath && !app.repository) {
          console.log('No local or remote APK, skipping');
          continue;
        }

        if (app.repository) {
          const pullDataFromRepo = await confirm({
            message: `Do you want to pull additional metadata from the source repository? (Name, description, tags, license, etc)`
          });

          const repoUrl = new URL(app.repository);

          try {
            if (repoUrl.hostname == 'github.com') {
              const { githubApp, githubApk, githubRelease } = await parseFromGithub(repoUrl.pathname.slice(1), relay, app.apkRegex, !apkPath, pullDataFromRepo);
              app.name ||= githubApp.name;
              apkPath ??= githubApk.path;
              // etc
            } else {
              throw `Unsupported repository service: ${repoUrl.hostname}`;
            }
          } catch (e) {
            console.error(e);
            continue;
          }
        }

        if (!Bun.which('apktool')) {
          console.log('No apktool found! Without it, you will have to manually enter: version, versionCode, SDK information, etc');
        }

        const apksignerPath = Bun.which('apksigner') ??
          await input({ message: `apksigner is part of the Android toolchain, please provide the path to it` });

        const apkResult = await extractFromApk(apkPath, apksignerPath);

        app.identifier ??= apkResult.identifier;
        fileMetadata.signatureHashes = apkResult.signatureHashes;
        fileMetadata.architectures = apkResult.architectures;

        // TODO ensure identifier
        // at this stage had: manual input in file and extract from APK, so force to input otherwise
        app.identifier ??= await input({ message: 'Identifier please' });

        const extraMetadata = await select({
          message: 'Do you want to pull extra metadata such as images?',
          choices: [
            {
              name: 'Google Play Store',
              value: 'play',
            },
            {
              name: 'F-Droid',
              value: 'fdroid',
            },
            {
              name: 'None',
              value: 'none',
            },
          ],
        });

        if (extraMetadata == 'play' || extraMetadata == 'fdroid') {
          const { images } = await parseFromPlayStore(app.identifier);
          // TODO upload here?
          app.images = images;
        }

        const signingMethod = await select({
          message: 'Events are ready. How would you like to sign and broadcast them?',
          choices: [
            {
              name: 'Browser with nostr extension',
              value: 'browser',
              description: 'Open events in a web browser to sign with a NIP-07 extension'
            },
            {
              name: 'Console with nsec',
              value: 'nsec',
              description: 'Show events in console and have this program sign them with your nsec'
            },
            {
              name: 'Console without nsec',
              value: 'console',
              description: 'Show events in the console to sign with nak or other tools'
            },
          ],
        });

        let nsec;
        if (signingMethod == 'nsec') {
          nsec = await password({
            message: 'Enter your nsec'
          });
          console.log(nsec);

          // TODO: Warn if nsec-derived npub does not match supplied npub in file

        } else if (!app.npub) {
          app.npub = await password({
            message: 'Enter your npub'
          });
          console.log(app.npub);
        }

        const { userMetadataEvent, appEvent, releaseEvent, fileMetadataEvent } = await produceEvents(app, fileMetadata, release, nsec);

        if (signingMethod == 'nsec') {
          await signEvents();
        }

        if (signingMethod == 'console') {
          console.log(appEvent);
          console.log(releaseEvent);
          console.log(fileMetadataEvent);
        }

        if (signingMethod == 'browser') {

          const server = Bun.serve({
            port: 32267,
            fetch() {
              // TODO generate an HTML/JS file with some templating engine
              // that includes all the events, and code to push to the zapstore relay (use http, not ws!)
              return new Response(JSON.stringify({ a: 1, b: 2 }));
            },
          });
          console.log('Server running at http://127.0.0.1:32267');

          let serverDone = false;
          while (!serverDone) {
            serverDone = await confirm({ message: 'Done signing in the browser?' });
          }
          server.stop();
        }

        // TODO save unsaved app values in YAML, as user signed and thus agrees with those values
        // TODO if apps remaining, prompt to continue loop or abort
      }
    }
  }
});