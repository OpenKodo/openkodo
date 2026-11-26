import { describe, expect, it } from 'vitest'

import { openKodoHandoffCode, openKodoHandoffFromArgs } from './handoff-url'

const CODE = 'oP2Q4nWDINcbZ0D7J-8m2Rg8rx-hd914JaE-DR5zCuI'

describe('openKodo handoff URLs', () => {
  it('reads the code from the connect URL', () => {
    expect(openKodoHandoffCode(`openkodo://connect?code=${CODE}`)).toBe(CODE)
  })

  it('ignores other orca links and missing codes', () => {
    expect(openKodoHandoffCode('openkodo://skill-share/abc')).toBeNull()
    expect(openKodoHandoffCode('openkodo://connect')).toBeNull()
    expect(openKodoHandoffCode('openkodo://connect?code=short')).toBeNull()
  })

  it('finds the URL inside second-instance argv', () => {
    expect(
      openKodoHandoffFromArgs(['/Applications/OpenKodo.app', `openkodo://connect?code=${CODE}`])
    ).toBe(CODE)
    expect(openKodoHandoffFromArgs(['--flag'])).toBeNull()
  })
})
