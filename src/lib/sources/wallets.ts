/**
 * Known-wallet registry: owner address → label + entity type.
 * Public, widely documented addresses (exchanges, market makers, programs).
 * Project-specific wallets (treasury, LP, launch) are resolved at ingest time
 * from MetaDAO's own allocation data rather than hardcoded here.
 */

export type EntityType =
  | "Exchange" | "Market Maker" | "VC" | "Custodian" | "Liquidity Pool"
  | "Treasury" | "Team" | "Founder" | "Protocol" | "Smart Money";

export interface WalletLabel { label: string; type: EntityType }

export const KNOWN_WALLETS: Record<string, WalletLabel> = {
  // exchanges
  "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9": { label: "Binance", type: "Exchange" },
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": { label: "Binance", type: "Exchange" },
  "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S": { label: "Coinbase", type: "Exchange" },
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS": { label: "Coinbase", type: "Exchange" },
  "GJRs4FwHtemZ5ZE9x3FNvJ8TgwitkBjVGbbwrhZS9CBb": { label: "Bybit", type: "Exchange" },
  "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2": { label: "Bybit", type: "Exchange" },
  "u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w": { label: "Gate.io", type: "Exchange" },
  "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD": { label: "OKX", type: "Exchange" },
  "ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ": { label: "MEXC", type: "Exchange" },
  "BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6": { label: "KuCoin", type: "Exchange" },
  "AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATSyrS": { label: "Crypto.com", type: "Exchange" },
  "FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5": { label: "Kraken", type: "Exchange" },

  // market makers
  "CEZN3prJs5a7ivpi86ph3wU7iaLPfC5H1qXtNQTHmTNL": { label: "Wintermute", type: "Market Maker" },
  "9yEZ5fjJRAFw6vDaHfaLdcNn8Yj4XuTJVvzmqfMKGpNn": { label: "Jump Trading", type: "Market Maker" },

  // AMM / program authorities
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": { label: "Raydium Authority", type: "Liquidity Pool" },
  "GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ": { label: "Raydium Authority v4", type: "Liquidity Pool" },
  "JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB": { label: "Orca Whirlpool", type: "Liquidity Pool" },
  "3uTzTX5GBSfbW7eM9R9k95H7Txe32Qw3Z25MtyD2dzwC": { label: "Meteora Vault", type: "Liquidity Pool" },

  // MetaDAO protocol
  "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq": { label: "MetaDAO Futarchy", type: "Protocol" },
  "moonDJUoHteKkGATejA5bdJVwJ6V6Dg74gyqyJTx73n": { label: "MetaDAO Launchpad", type: "Protocol" },
  "moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM": { label: "MetaDAO Launchpad v0.7", type: "Protocol" },
};

export function labelFor(address: string | null | undefined): WalletLabel | null {
  return address ? KNOWN_WALLETS[address] ?? null : null;
}

/** Badge colour per entity type, using the terminal's status palette. */
export function entityColor(type: EntityType | string | null): string {
  switch (type) {
    case "Exchange": return "var(--accent)";
    case "Market Maker": return "var(--accent-2)";
    case "Treasury":
    case "Protocol": return "var(--good)";
    case "Team":
    case "Founder": return "var(--warn)";
    case "Liquidity Pool": return "var(--ink-2)";
    case "VC":
    case "Smart Money": return "var(--serious)";
    default: return "var(--ink-muted)";
  }
}
