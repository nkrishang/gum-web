/**
 * Client-side mirror of gum-server's webhook target rules (src/webhooks/target.rs),
 * so a bad endpoint is caught in the form rather than as a 400 from the API.
 * Production rules only: public https, no credentials, no private, loopback,
 * link-local, single-label, `.internal`, `.local` or `.localhost` hosts.
 */
export function validateWebhookUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.length > 2048) return "The URL is longer than 2048 characters.";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "That does not look like a URL.";
  }
  if (url.username || url.password) return "Credentials in the URL are not allowed.";
  if (url.protocol !== "https:") return "The endpoint must use https.";

  const host = url.hostname.toLowerCase();
  if (!host) return "The URL has no host.";

  if (host.startsWith("[") && host.endsWith("]")) {
    return isPublicIpv6(host.slice(1, -1)) ? null : "The endpoint must be a public address.";
  }
  const v4 = parseIpv4(host);
  if (v4) return isPublicIpv4(v4) ? null : "The endpoint must be a public address.";

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    !host.includes(".")
  ) {
    return "The endpoint must be a public hostname, like api.yourapp.com.";
  }
  return null;
}

function parseIpv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

function isPublicIpv4([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && b === 254) return false; // link-local, including the metadata address
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0) return false; // documentation and IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false; // benchmarking, documentation
  if (a === 203 && b === 113) return false; // documentation
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

function isPublicIpv6(literal: string): boolean {
  const ip = literal.toLowerCase();
  if (ip === "::" || ip === "::1") return false; // unspecified, loopback
  if (/^f[cd]/.test(ip)) return false; // fc00::/7 unique local
  if (/^fe[89ab]/.test(ip)) return false; // fe80::/10 link local
  // IPv4-mapped: the URL parser normalises ::ffff:127.0.0.1 to ::ffff:7f00:1.
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (dotted) {
    const v4 = parseIpv4(dotted[1]);
    return v4 ? isPublicIpv4(v4) : false;
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPublicIpv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }
  return true;
}
