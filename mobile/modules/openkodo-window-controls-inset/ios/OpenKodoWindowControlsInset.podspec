Pod::Spec.new do |s|
  s.name = 'OpenKodoWindowControlsInset'
  s.version = '0.0.1'
  s.summary = 'Keeps app content clear of the iPadOS window controls'
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
