Pod::Spec.new do |s|
  s.name = 'OpenKodoReservedRegions'
  s.version = '0.0.1'
  s.summary = 'Reports the window regions a fold or camera reserves on iPhone Duo'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'OpenKodo'
  s.homepage = 'https://openkodo.dev'
  s.source = { :git => 'https://github.com/OpenKodo/openkodo.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
