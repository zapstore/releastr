import styles from './App.module.css';
import { Show, createSignal } from 'solid-js';

function App() {

  const API_URL = 'https://zap.store/releastr';

  const [appName, setAppName] = createSignal('');
  const [appDescription, setAppDescription] = createSignal('');
  const [appIdentifier, setAppIdentifier] = createSignal('');
  const [releaseVersion, setReleaseVersion] = createSignal('');
  const [releaseEvent, setReleaseEvent] = createSignal(null);

  const [artifactUrl, setArtifactUrl] = createSignal('');
  const [artifactDescription, setArtifactDescription] = createSignal('');
  const [releaseImage, setReleaseImage] = createSignal('');
  const [artifactRepository, setArtifactRepository] = createSignal('');
  const [artifactTags, setArtifactTags] = createSignal([]);
  const [artifactEvent, setArtifactEvent] = createSignal(null);

  const releasePartialEvent = () => {
    const tags = [
      ["i", appIdentifier()],
      ["title", appName()],
      ['version', releaseVersion()],
      ["image", releaseImage()],
    ];

    const a = {
      kind: 30063,
      created_at: Math.floor(Date.now() / 1000),
      content: appDescription(),
      tags
    };
    if (artifactEvent()) {
      a.tags = [...a.tags, ['e', artifactEvent().id]];
    }
    if (appIdentifier() && releaseVersion()) {
      a.tags = [...a.tags, ["d", `${appIdentifier()}@${releaseVersion()}`]];
    }
    return a;
  };

  const artifactPartialEvent = () => {
    const a = {
      kind: 1063,
      created_at: Math.floor(Date.now() / 1000),
      content: artifactDescription(),
      tags: artifactTags()
    };
    if (artifactRepository()) {
      a.tags = [...artifactTags(), ["repository", artifactRepository()]];
    }
    return a;
  };

  async function loadArtifact() {
    const response = await fetch(`${API_URL}/artifact/${encodeURIComponent(artifactUrl())}`);
    const json = await response.json();
    setArtifactTags(json.tags);
  }

  const releaseButtonDisabled = () => !artifactEvent() || !appIdentifier() || !releaseVersion() || !appName();

  const artifactButtonDisabled = () => {
    return artifactTags().length === 0;
  };

  const signArtifact = async () => {
    const sig = await window.nostr.signEvent(artifactPartialEvent());
    console.log(sig);
    setArtifactEvent(sig);
  };

  const signRelease = async () => {
    const sig = await window.nostr.signEvent(releasePartialEvent());
    console.log(sig);
    setReleaseEvent(sig);
  };

  const publishRelease = async () => {
    const url = `${API_URL}/publish`;

    const data = JSON.stringify({
      artifact: artifactEvent(),
      release: releaseEvent()
    });

    const headers = {
      'Content-Type': 'application/json'
    };

    fetch(url, {
      method: 'POST',
      headers: headers,
      body: data
    });
  };

  return (
    <div class={styles.App}>
      <header class={styles.header}>
        <h3>releastr</h3>
      </header>

      <h3>Artifacts</h3>

      <div class={styles.part}>
        <em>Only 1 artifact supported at the moment</em>
      </div>

      <Show when={!artifactEvent()}>
        <div class={styles.part}>
          Source URL: <input
            type="text"
            placeholder="https://github.com/example/wallet/releases/download/v1.2.1/wallet-v1.2.1.apk"
            value={artifactUrl()}
            onInput={(e) => setArtifactUrl(e.target.value)}
          />
          <button onclick={loadArtifact}>Fetch</button>
        </div>

        <div class={styles.part}>
          Content (indexable): <input
            type="text"
            placeholder="example bitcoin wallet"
            value={artifactDescription()}
            onInput={(e) => setArtifactDescription(e.target.value)}
          />
        </div>

        <div class={styles.part}>
          Source repository: <input
            type="text"
            placeholder="https://github.com/example/wallet"
            value={artifactRepository()}
            onInput={(e) => setArtifactRepository(e.target.value)}
          />
        </div>

        <h4>Partial event (id, pubkey, created_at, sig will be added when signing)</h4>

        <pre>
          <code innerHTML={JSON.stringify(artifactPartialEvent(), null, 2)}></code>
        </pre>

        <Show when={!artifactButtonDisabled()}>
          <p>Manually verify the hash before signing!<br/><br/>
            <code>curl -sL "{artifactUrl()}" -o - | shasum -a 256`</code>
          </p>
        </Show>
        <button class={styles.submit} disabled={artifactButtonDisabled()} onclick={signArtifact}>Sign artifact</button>
      </Show>

      <Show when={artifactEvent()}>
        <pre>
          <code innerHTML={JSON.stringify(artifactEvent(), null, 2)}></code>
        </pre>
      </Show>

      <h3>Release</h3>

      <Show when={!releaseEvent()}>
        <div class={styles.part}>
          Name: <input
            type="text"
            placeholder="Example App"
            value={appName()}
            onInput={(e) => setAppName(e.target.value)}
          />
        </div>

        <div class={styles.part}>
          Identifier: <input
            type="text"
            placeholder="com.example.app"
            value={appIdentifier()}
            onInput={(e) => setAppIdentifier(e.target.value)}
          />
        </div>

        <div class={styles.part}>
          Version: <input
            type="text"
            placeholder="1.2.1"
            value={releaseVersion()}
            onInput={(e) => setReleaseVersion(e.target.value)}
          />
        </div>

        <div class={styles.part}>
          Icon URL: <input
            type="text"
            value={releaseImage()}
            onInput={(e) => setReleaseImage(e.target.value)}
          />
        </div>

        <div class={styles.part}>
          Content (indexable): <input
            type="text"
            placeholder="example bitcoin wallet"
            value={appDescription()}
            onInput={(e) => setAppDescription(e.target.value)}
          />
        </div>

        <h4>Partial event (id, pubkey, created_at, sig will be added when signing)</h4>

        <pre>
          <code innerHTML={JSON.stringify(releasePartialEvent(), null, 2)}></code>
        </pre>
        <button class={styles.submit} disabled={releaseButtonDisabled()} onclick={signRelease}>Sign release</button>
      </Show>

      <Show when={releaseEvent()}>
        <pre>
          <code innerHTML={JSON.stringify(releaseEvent(), null, 2)}></code>
        </pre>
        <button class={styles.submit} onclick={publishRelease}>Publish release</button>
      </Show>
    </div>
  );
}

export default App;
