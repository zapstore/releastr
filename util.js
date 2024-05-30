import { $ } from "bun";
import { extname } from "bun:path";

export const renameToHash = async (name) => {
  const ext = extname(name);
  const _hash = await $`cat $NAME | shasum -a 256 | head -c 64`.env({ NAME: name }).text();
  const hash = _hash.trim();
  let hashName = `${hash}${ext}`;
  if (hash === hashName) {
    const _mimeType = await $`file -b --mime-type $NAME`.env({ NAME: name }).text();
    const [_t1, _t2] = _mimeType.trim().split('/');
    if (_t1.trim() == 'image') {
      hashName = `${hash}.${_t2}`;
    }
  }
  await $`mv $SRC $DEST`.env({ SRC: name, DEST: hashName }).quiet();
  return [hash, hashName];
};

export const selectBestString = (strings, priorities) => {
  // Create a map to store the scores for each string
  const scores = new Map();

  // Iterate over the strings
  for (const str of strings) {
    let score = 0;

    // Iterate over the priorities
    for (const [priority, weight] of priorities) {
      // Check if the string matches the priority
      if (str.match(priority)) {
        // Add the weight to the score
        score += weight;
      }
    }

    // Add the score to the map
    scores.set(str, score);
  }

  // Find the string with the highest score
  let bestString = null;
  let bestScore = -Infinity;

  for (const [str, score] of scores.entries()) {
    if (score > bestScore) {
      bestString = str;
      bestScore = score;
    }
  }

  // Return the best string
  return bestString;
};

export const querySync = async (relay, filter) => {
  return new Promise(async resolve => {
    const events = [];
    const sub = relay.subscribe([filter], {
      onevent(event) {
        events.push(event);
      },
      oneose() {
        resolve(events);
        sub.close();
      },
    });
  });
};