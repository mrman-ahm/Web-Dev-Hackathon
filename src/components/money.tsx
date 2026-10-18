import type { MoneyTotal } from '@/contracts/ui';

/** Retains exact integer minor units, including amounts larger than Number.MAX_SAFE_INTEGER. */
export function formatMoney(money: MoneyTotal, locale = 'en-US'): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency });
  const decimals = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = BigInt(money.amountMinor);
  const negative = amount < 0n;
  const magnitude = negative ? -amount : amount;
  const divisor = 10n ** BigInt(decimals);
  const whole = magnitude / divisor;
  const fraction = (magnitude % divisor).toString().padStart(decimals, '0');
  const signedWhole = negative ? (whole === 0n ? -0 : -whole) : whole;
  return formatter.formatToParts(signedWhole).map((part) => part.type === 'fraction' ? fraction : part.value).join('');
}

export function MoneyList({ totals }: { totals: readonly MoneyTotal[] }) {
  if (!totals.length) return <p className="ub-muted">No confirmed amounts</p>;
  return <ul className="ub-money-list">{totals.map((total) => <li key={total.currency}>{formatMoney(total)}<small>{total.currency}</small></li>)}</ul>;
}
