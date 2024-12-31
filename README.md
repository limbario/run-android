# Limbar Android Action

Run this action to create a remote Android instance in Limbar and connect to it
without having to spend CPU cycles on running an emulator.

## Inputs

### `token`

**Required** The token to use to authenticate with Limbar.

### `organization-id`

**Optional** The organization to create the Android instance in. If not given,
the default organization from the token is used.

### `region`

**Optional** The region to create the Android instance in. The closest one is
chosen if not given.

## Example usage

The following step will create a new Android instance in the default
organization and region, and connect to it. Then you can run any commands that
expects an Android device to be connected, such as Appium, `flutter run`,
`gradle` commands, etc.

Once the Github workflow completes, a post-action step will clean up the
instance.

```yaml
- name: Run Android
  uses: limbario/run-android@v0.1.0
  with:
    token: ${{ secrets.LIM_TOKEN }}

- name: Run tests
  run: ./gradlew connectedCheck --stacktrace
```
