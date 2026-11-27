import { describe, expect, it } from 'vitest'
import { acceptedTicketUrl } from './cloud-console-link'

describe('acceptedTicketUrl', () => {
  const allowed = ['https://console.openkodo.dev', 'https://login.onopenkodo.dev']

  it('opens a ticket URL only on an allowed origin, without credentials, over http(s)', () => {
    const ticket = 'https://console.openkodo.dev/console/ticket?t=abc'
    expect(acceptedTicketUrl(ticket, allowed)).toBe(ticket)
    expect(acceptedTicketUrl('https://console.openkodo.dev.evil.test/console', allowed)).toBeNull()
    expect(
      acceptedTicketUrl('https://evil.test/?u=https://console.openkodo.dev', allowed)
    ).toBeNull()
    expect(acceptedTicketUrl('https://user:pw@console.openkodo.dev/console', allowed)).toBeNull()
    expect(acceptedTicketUrl('http://console.openkodo.dev/console', allowed)).toBeNull()
    expect(acceptedTicketUrl('javascript:alert(1)', allowed)).toBeNull()
    expect(acceptedTicketUrl('file:///etc/passwd', allowed)).toBeNull()
    expect(acceptedTicketUrl({ url: ticket }, allowed)).toBeNull()
    expect(acceptedTicketUrl('not a url', allowed)).toBeNull()
  })
})
