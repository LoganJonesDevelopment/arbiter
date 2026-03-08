from arbiter.config import settings


def polymarket_fee(price: float) -> float:
    return settings.fee_rate * (1.0 - price)


def kalshi_fee(price: float) -> float:
    return settings.kalshi_profit_fee * price * (1.0 - price)
