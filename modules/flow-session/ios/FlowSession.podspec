Pod::Spec.new do |s|
  s.name           = 'FlowSession'
  s.version        = '1.0.0'
  s.summary        = 'Business Flow dictation session (mic, App Group, keyboard bridge)'
  s.description    = 'AVAudioEngine 16 kHz capture, App Group shared state and Darwin notifications for the Business Flow keyboard.'
  s.author         = 'Business Native'
  s.homepage       = 'https://github.com/businessnative'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,mm,swift}"
end
