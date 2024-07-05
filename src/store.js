import { join, basename, extname } from "bun:path";
import { renameToHash } from './util';

export const extractFromStore = async () => {
  const url = `https://play.google.com/store/apps/details?id=${appIdentifier}`;

  const playStoreHTML = Buffer.alloc(1.5 * 1024 * 1024);
  await $`curl -s $URL > ${playStoreHTML}`.env({ URL: url });

  const playStoreAvailable = !playStoreHTML.toString().includes('not found');

  const imageHashNames = [];

  if (playStoreAvailable) {
    const _name = await $`cat < ${playStoreHTML} | xq -q 'h1[itemprop=name]'`.text();
    appName ||= _name.trim();
    console.log('- Found name', appName);

    const _description = await $`cat < ${playStoreHTML} | xq -n -q 'div[data-g-id=description]' | pandoc -f html --wrap=none -t markdown | sed '1d;$d''`.text();
    appDescription ||= _description.replaceAll('\\\n', '\n');

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
    // TODO set appIcon here?
    appName ||= repoJson.name || args.github;
    appDescription ||= repoJson.description || "";
    // TODO check appIcon, convert svg to png
    const [_, iconHashName] = iconPath ? await renameToHash(iconPath) : [undefined, undefined];
    if (iconHashName) {
      console.log('- Found icon', iconHashName);
    }
  }

};