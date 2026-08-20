# Network Lockdown: Preventing DoH/DoT/DoQ Bypass

netintel only sees what goes through Technitium. Modern OSes and browsers increasingly default to **encrypted DNS that bypasses your router entirely** — Chrome/Firefox's built-in DoH, Windows 11's system-wide DoH, Android Private DNS, etc. If a device uses one of these instead of your Technitium instance, netintel is blind to it.

**This guide closes ~95% of the default-behavior gap.** It cannot stop a determined user running their own VPN or a custom DoH server — that's a fundamental limitation of DNS-layer enforcement, not something any tool (including commercial ones) actually solves. See the honesty note at the bottom.

---

## What you're blocking

| Protocol | Port | How |
|---|---|---|
| DNS-over-TLS (DoT) | TCP+UDP 853 | Block the port outright — nothing else uses it |
| DNS-over-QUIC (DoQ) | UDP 853 (primary), sometimes UDP 443 | Block 853; optionally block UDP/443 to known resolver IPs |
| DNS-over-HTTPS (DoH) | TCP 443 (shares with normal HTTPS) | Block by destination IP/SNI — can't be told apart from other traffic by port alone |
| Plain DNS to a hardcoded resolver (e.g. `8.8.8.8`) | UDP/TCP 53 | NAT-redirect all outbound port 53 back to your Technitium instance |
| Firefox's DoH auto-enable | — | Have Technitium return NXDOMAIN for `use-application-dns.net` |

---

## Step 1 — Firefox canary domain (do this first, it's free)

In Technitium's web UI: **Zones → Add Zone** → `use-application-dns.net` → add an A/AAAA record that doesn't resolve, or explicitly block the domain in your blocking config so it returns NXDOMAIN. Firefox checks this domain on startup and automatically disables its built-in DoH if the lookup fails. No firewall rule needed, zero side effects on anything else.

---

## Step 2 — Block DoT and DoQ (port 853)

### Linux (nftables — modern default on most distros)

```bash
sudo nft add rule inet filter forward tcp dport 853 drop
sudo nft add rule inet filter forward udp dport 853 drop
```

### Linux (iptables — older distros / OpenWrt)

```bash
sudo iptables -A FORWARD -p tcp --dport 853 -j DROP
sudo iptables -A FORWARD -p udp --dport 853 -j DROP
```

### Windows (as a router — uncommon, but if Windows is doing routing/ICS)

```powershell
New-NetFirewallRule -DisplayName "Block DoT outbound" -Direction Outbound -Protocol TCP -RemotePort 853 -Action Block
New-NetFirewallRule -DisplayName "Block DoT outbound UDP" -Direction Outbound -Protocol UDP -RemotePort 853 -Action Block
```

### Consumer router (OPNsense/pfSense)

Firewall -> Rules -> LAN -> Add:
- Protocol: TCP/UDP, Destination port: 853, Action: Block

### Consumer router (stock firmware, e.g. most home routers)

Look for "Outbound Rules," "Access Control," or "Firewall" in the admin UI. Block outbound TCP+UDP 853. Exact steps vary too much by vendor to script here — if your router doesn't support outbound port blocking at all, consider OpenWrt or a dedicated firewall box (OPNsense on a mini PC) in front of it.

---

## Step 3 — Redirect plain DNS (port 53) to Technitium

Any device hardcoding a public resolver (`8.8.8.8`, `1.1.1.1`) instead of using DHCP-assigned DNS should get forced back to Technitium.

### Linux (nftables, replace `192.168.1.10` with your Technitium IP)

```bash
sudo nft add rule ip nat prerouting iifname "br-lan" udp dport 53 dnat to 192.168.1.10:53
sudo nft add rule ip nat prerouting iifname "br-lan" tcp dport 53 dnat to 192.168.1.10:53
```

### OPNsense/pfSense

Firewall -> NAT -> Port Forward -> New: source any, destination port 53 (TCP+UDP), redirect target `192.168.1.10:53`. Exclude the Technitium box itself from this rule to avoid a redirect loop.

---

## Step 4 — Block DoH by destination (the hard one)

DoH rides on port 443 alongside every other HTTPS site, so you can't block the port — you have to block the *destination*. This means maintaining a list of known public DoH resolver hostnames/IPs (Cloudflare's `1.1.1.1`/`cloudflare-dns.com`, Google's `8.8.8.8`/`dns.google`, Quad9, NextDNS, etc.) and denying outbound 443 to them.

### OPNsense/pfSense (recommended platform for this step)

1. Firewall -> Aliases -> add a URL-table or manual alias containing known DoH resolver IPs (search "DoH provider IP list" for a maintained community list — these change over time, so prefer a URL-table alias that auto-updates over a static list).
2. Firewall -> Rules -> LAN -> Block rule: destination = that alias, port 443, above your normal allow rules.
3. Optionally also block UDP/443 to the same alias to cover DoQ's fallback-to-443 behavior. Note this also blocks HTTP/3 generally for everyone — browsers fall back to HTTP/2 silently, which is normally an acceptable tradeoff.

### Stock consumer routers

Most don't support destination-based blocking on port 443 at all. This step realistically requires OPNsense/pfSense, a Pi-hole-adjacent box with more firewall control, or a managed switch/router with real ACL support. If you're on stock firmware, steps 1-3 above are still worth doing — they cover DoT/DoQ/plain-DNS bypass, which is most of the gap.

---

## Honesty note

None of this stops:
- A device on a VPN (all its DNS goes through the VPN tunnel, invisible to your LAN)
- Someone deliberately running their own DoH server on an unlisted IP
- A sufficiently technical user who wants to route around this on purpose

This guide closes the *default-behavior* gap — the overwhelming majority of devices that would otherwise silently start using encrypted DNS because their OS/browser defaults to it, not because anyone chose to bypass monitoring. If you need airtight enforcement against a hostile user on your own network, DNS-layer controls alone were never going to get you there; that's a different (and much harder) problem than what netintel is built to solve.
