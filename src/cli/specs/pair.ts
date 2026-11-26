import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

export const PAIR_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['pair'],
    summary:
      'Pair a phone or another OpenKodo with the OpenKodo already running here, without restarting it',
    usage:
      'openkodo pair [--mobile [--relay]] [--address <host>] [--grant-desktop-control] [--rotate] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'mobile',
      'relay',
      'address',
      'grant-desktop-control',
      'rotate'
    ],
    notes: [
      'Asks the OpenKodo running for this profile (desktop app, `openkodo serve`, or its service) for a pairing offer. Nothing restarts and existing clients stay connected.',
      'Without --mobile it prints an access link for another OpenKodo (Settings → Remote OpenKodo Servers → Add Server). --mobile prints a QR code and link for OpenKodo Mobile.',
      '--address is the host or IP the client should dial, such as a Tailscale address. Without it OpenKodo picks this machine’s default LAN address.',
      'The first network pairing makes a loopback-only OpenKodo listen on every interface, as pairing from the desktop app does.',
      'Mobile pairing is LAN-only (same network or tailnet) unless --relay is given; Relay needs this host’s OpenKodo signed in (`openkodo auth login`).',
      'An unused offer is reused until --rotate replaces it. After OpenKodo restarts it can’t be printed again, so a new one is made and the earlier link keeps working until --rotate. Clients that already paired keep their access.',
      "--grant-desktop-control lets OpenKodo drive this machine's desktop (openkodo computer) for the paired OpenKodo. Off, OpenKodo won't do it for the client; anything with a terminal here can. It applies only to an access link, not to a phone.",
      'Paired clients and phones can’t create offers through OpenKodo, but anything with a terminal here can. Revoking a paired client also revokes links made from terminals it opened.'
    ],
    examples: [
      'openkodo pair --mobile',
      'openkodo pair --mobile --address 100.64.1.20',
      'openkodo pair --address 100.64.1.20',
      'openkodo pair --mobile --rotate --json'
    ]
  }
]
