## Objects

INTERACTIVE: IF NOT IN YAML ASK, THEN STORE
NON-INTERACTIVE: TELL TO MANUALLY ADD IN YAML IF NEEDED

- app
  - identifier [APKTOOL, INTERACTIVE]
  - name [APKTOOL, INTERACTIVE]
  - icon [APKTOOL, INTERACTIVE]
  - author (npub) [INTERACTIVE]
  - repository [INTERACTIVE]
  - githubStarCount [REMOVE, PULL THIS FROM DVM?]
  - githubForkCount [REMOVE, PULL THIS FROM DVM?]
  - license [NON-INTERACTIVE]

- wiki [NON-INTERACTIVE] [ASK TO PROVIDE BECH32 POINTER]
  - summary
  - description
  - homepage
  - images
  - tags

- file metadata [ALLOW ONLY ONE KIND 1063 FOR NOW] [DO NOT SAVE ANY OF THESE BELOW]
  - version [APKTOOL, INTERACTIVE]
  - versionCode [APKTOOL, INTERACTIVE]
  - minSdk [APKTOOL, NON-INTERACTIVE]
  - targetSdk [APKTOOL, NON-INTERACTIVE]
  - architectures [APKTOOL, UNZIP, INTERACTIVE]
  - size
  - signature hashes [APKSIGNER, INTERACTIVE, SAVE BUT TRY TO DOUBLE CHECK]

- release [DO NOT SAVE ANY OF THESE BELOW]
  - version [APKTOOL, INTERACTIVE] (already have it)
  - summary [INTERACTIVE]
  - url [INTERACTIVE]

- cryptographic identity
  - signature hashes (already have them)
  - public key

## Flow

- cryptographic identity
  - grab already provided signature hashes
  - give instructions in terminal to provide
    - signed message
      - `keytool -importkeystore -srckeystore example.keystore -destkeystore example.p12 -deststoretype pkcs12`
      - `openssl pkcs12 -in example.p12 -nocerts -nodes -out privatekey.pem`
      - `echo 'Verifying that I control the following Nostr public key: "<npub encoded public key>"' | openssl dgst -sha256 -sign privatekey.pem | openssl base64 -A` (replace pubkey with provided one)
    - public key
      - `keytool -list -keystore example.keystore` (check against earlier signature hashes)