/**
 * Wallet failures arrive as provider errors, viem errors or bare objects depending on the wallet.
 * The ones a payer can act on get plain words; everything else is generic rather than a stack.
 */
export function walletErrorMessage(error: unknown, action: "transfer" | "connect" | "network" = "transfer"): string {
  const code = readCode(error);
  const message = readMessage(error);

  // EIP-1193: 4001 user rejected, 4902 chain not added.
  if (code === 4001 || /user rejected|user denied|rejected the request|user cancel/i.test(message)) {
    if (action === "connect") return "You declined the connection in your wallet.";
    if (action === "network") return "You declined the network change in your wallet.";
    return "You declined in your wallet. Nothing was sent.";
  }
  if (code === 4902 || /unrecognized chain|chain .* not added|not been added/i.test(message)) {
    return "Your wallet doesn't have this network yet. Add it in your wallet, then try again.";
  }
  if (/chain mismatch|does not match the target chain|wrong network/i.test(message)) {
    return "Your wallet is on a different network. Switch networks and try again.";
  }
  if (/insufficient funds|gas required exceeds/i.test(message)) {
    return "Not enough gas in this wallet to send the transfer.";
  }
  if (/transfer amount exceeds balance|exceeds balance/i.test(message)) {
    return "This wallet doesn't hold enough of the token.";
  }
  if (/already pending|request already/i.test(message)) {
    return "Your wallet already has a request open. Check it, then try again.";
  }
  if (/timeout|timed out/i.test(message)) {
    return "Your wallet didn't respond. Try again.";
  }
  if (action === "connect") return "Couldn't connect. Try again.";
  if (action === "network") return "Couldn't change the network. Try again, or switch it in your wallet.";
  return "The transfer wasn't sent. Try again, or pay with the QR code or address.";
}

/** The wallet doesn't have the network (EIP-3326's 4902, or the words wallets use for it). */
export function isUnknownChain(error: unknown): boolean {
  return readCode(error) === 4902 || /unrecognized chain|unknown chain|not been added|chain .* not added|add.*chain first/i.test(readMessage(error));
}

function readCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const record = error as Record<string, unknown>;
  if (typeof record.code === "number") return record.code;
  if (record.cause) return readCode(record.cause);
  return null;
}

function readMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return "";
  const record = error as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.shortMessage === "string") parts.push(record.shortMessage);
  if (typeof record.details === "string") parts.push(record.details);
  if (typeof record.message === "string") parts.push(record.message);
  if (record.cause) parts.push(readMessage(record.cause));
  return parts.join(" ");
}
