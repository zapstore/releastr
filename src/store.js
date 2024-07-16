import { join, basename } from "bun:path";
import { renameToHash } from './util';
import { $ } from "bun";
import ora from 'ora';

const BLOSSOM_DIR = Bun.env.BLOSSOM_DIR ?? '/tmp';

// TODO REMOVE XQ DEPENDENCY

export const parseFromPlayStore = async (identifier) => {
  if (!identifier) return;
  const spinner = ora('Fetching metadata from Google Play Store...').start();

  const url = `https://play.google.com/store/apps/details?id=${identifier}`;

  const playStoreHTML = Buffer.alloc(1.5 * 1024 * 1024);
  await $`curl -s $URL > ${playStoreHTML}`.env({ URL: url });

  const playStoreAvailable = !playStoreHTML.toString().includes('not found');

  const imageHashNames = [];

  if (!playStoreAvailable) {
    spinner.fail();
    return {};
  }

  const _name = await $`cat < ${playStoreHTML} | xq -q 'h1[itemprop=name]'`.text();
  let appName = _name.trim();

  const _description = await $`cat < ${playStoreHTML} | xq -n -q 'div[data-g-id=description]' | pandoc -f html --wrap=none -t markdown | sed '1d;$d''`.text();
  let appDescription = _description.replaceAll('\\\n', '\n');

  const _iconUrls = await $`cat < ${playStoreHTML} | xq -q 'img[itemprop=image]' -a 'src'`.text();
  const iconUrl = _iconUrls.trim().split('\n')[0];

  const _imageUrls = await $`cat < ${playStoreHTML} | xq -q 'img[data-screenshot-index]' -a 'src'`.text();
  const imageUrls = _imageUrls.trim().split('\n');

  for (const imageUrl of imageUrls) {
    if (imageUrl.trim()) {
      const tempImagePath = join(BLOSSOM_DIR, basename(imageUrl));
      await Bun.write(tempImagePath, await fetch(imageUrl));
      const [_, imageHashName] = await renameToHash(tempImagePath);
      imageHashNames.push(imageHashName);
    }
  }

  spinner.succeed('Fetched metadata from Google Play Store');

  // if (!iconPath && iconUrl.trim()) {
  //   iconPath = join(BLOSSOM_DIR, basename(iconUrl));
  //   await Bun.write(iconPath, await fetch(iconUrl));
  // }

  return {
    name: appName,
    description: appDescription,
    // icon: iconPath,
    images: imageHashNames,
  };
};