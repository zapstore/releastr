import { parse } from 'yaml';
import { withRelay } from './src/util';
import { parseFromGithub, parseFromGitlab } from './src/repo';
import { extractFromApk } from "./src/apk";
import { extractFromStore as parseFromPlayStore } from "./src/store";
import { signEvents } from "./src/sign";
import input from '@inquirer/input';

// Load metadata from zapstore.yaml
// TODO create file if not exists
const yamlText = await Bun.file(`${import.meta.dir}/zapstore.yaml`).text();
let apps = Object.values(parse(yamlText));

const onlyProcess = Bun.env.ONLY_PROCESS;
if (onlyProcess) {
  const key = Object.keys(apps).find(k => k == onlyProcess);
  if (key) {
    apps = [apps[key]];
  }
}

if (apps.length > 1) {
  console.log(`Loading ${apps.length} apps...`);
}

await withRelay('wss://relay.zap.store', async (relay) => {
  for (const value of apps) {
    // Load values in file
    const app = {
      name: value.name,
      description: value.description,
      icon: value.icon,
      apkRegexps: value.apkRegexps,
      npub: value.npub
    };

    // REPO PHASE

    const answer = await input({ message: 'Input your github repo as owner/project:' });

    // check/input github project
    // do you have an APK locally?
    // pull release data (and APK if necessary)

    let appFromRepo, releaseFromRepo;

    try {
      if (value.github) {
        ({ appFromRepo, releaseFromRepo } = await parseFromGithub(value.github, relay));
      } else if (value.gitlab) {
        ({ appFromRepo, releaseFromRepo } = await parseFromGitlab(value.gitlab, relay));
      } else {
        throw 'Unsupported repository service';
      }
    } catch (e) {
      console.error(e);
      continue;
    }

    // merge values and prompt user
    app.name ||= appFromRepo.name;
    app.description ||= appFromRepo.description;

    // apktool or start asking
    // apksigner (dev SHOULD have them as its android tools: /opt/android/build-tools/30.0.3/apksigner)
    // ask them to input path if necessary

    const { appFromApk } = await extractFromApk();

    // merge values and prompt user: play store or fdroid

    const { appFromStore } = await parseFromPlayStore();

    // merge values and prompt user
    // ask for nsec or otherwise print out 
    // (if nsec derive npub, else ask npub), check for kind 0, does it have x509 from APK?
    // if not, generate new kind 0 ready to be signed
    // generate 1063, 30063, 32267 ready to sign
    // if nsec then ask for relays, otherwise
    //     (a) boot server to open in browser for signing with NIP-07
    //     (b) print for signing with nak or other

    await signEvents();

  }
});