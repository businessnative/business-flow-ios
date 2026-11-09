/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'widget',
  name: 'BusinessFlowWidget',
  displayName: 'Business Flow',
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  colors: { $accent: '#c0c0e7', $widgetBackground: '#0a0a0b' },
});
