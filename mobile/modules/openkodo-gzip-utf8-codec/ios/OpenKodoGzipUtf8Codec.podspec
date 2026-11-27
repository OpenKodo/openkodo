Pod::Spec.new do |s|
  s.name = 'OpenKodoGzipUtf8Codec'
  s.version = '0.0.1'
  s.summary = 'Bounded gunzip and brotli inflate, and strict UTF-8 decode'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'OpenKodo'
  s.homepage = 'https://openkodo.dev'
  s.source = { :git => 'https://github.com/OpenKodo/openkodo.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.libraries = 'z', 'compression'
  s.source_files = '**/*.swift'
end
