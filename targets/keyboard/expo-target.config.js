/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'keyboard',
  name: 'BusinessFlowKeyboard',
  displayName: 'Business Flow',
  bundleIdentifier: '.keyboard',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'UIKit'],
  icon: '../../assets/icon.png',
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
    'keychain-access-groups': config.ios.entitlements['keychain-access-groups'],
  },
});
