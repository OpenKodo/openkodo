// A startOpenkodod test that fails partway must not leave latches closed: later tests in the worker would wait 10 s.
import { afterEach } from 'vitest'
import { _resetOpenkododFeatureReadinessForTests } from '../../../../src/main/runtime/rpc/startup/openkodod-readiness'

afterEach(() => {
  _resetOpenkododFeatureReadinessForTests()
})
