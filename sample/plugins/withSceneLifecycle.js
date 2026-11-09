/**
 * Adopts the UIScene life cycle, which iOS 27 requires: without it the app asserts at launch.
 *
 * Expo ships the scene delegate (`ExpoAppSceneDelegate`), but its prebuild template still starts
 * React Native from the app delegate in a window it creates itself. This plugin:
 * - adds a scene manifest to Info.plist that names `EXExpoAppSceneDelegate`;
 * - makes `AppDelegate` an `ExpoReactNativeFactoryProvider` and leaves window creation and
 *   `startReactNative` to the scene delegate.
 *
 * Remove it once the Expo template adopts scenes itself.
 */
const { withInfoPlist, withAppDelegate } = require('@expo/config-plugins');

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
      },
    ],
  },
};

// The block the template uses to start React Native in its own window.
const START_IN_APP_DELEGATE =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return c;
  });
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle: expected a Swift AppDelegate');
    }
    let src = c.modResults.contents;
    if (src.includes('ExpoReactNativeFactoryProvider')) return c; // already applied
    src = src.replace(
      'class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    );
    if (!START_IN_APP_DELEGATE.test(src)) {
      throw new Error('withSceneLifecycle: the AppDelegate template changed; update this plugin');
    }
    src = src.replace(
      START_IN_APP_DELEGATE,
      '\n    // React Native starts in the window the scene delegate creates (ExpoAppSceneDelegate).\n',
    );
    c.modResults.contents = src;
    return c;
  });
}

module.exports = withSceneLifecycle;
