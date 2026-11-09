/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
// Share Extension: "Megosztás → Business Flow" for iOS 18 call recordings (audio) and their Notes transcripts (text).
// It only copies the item into the App Group inbox; the app processes it on next foreground.
module.exports = (config) => ({
  type: 'share',
  name: 'BusinessFlowShare',
  displayName: 'Business Flow',
  bundleIdentifier: '.share',
  deploymentTarget: '17.0',
  frameworks: ['UIKit', 'UniformTypeIdentifiers'],
  icon: '../../assets/icon.png',
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
