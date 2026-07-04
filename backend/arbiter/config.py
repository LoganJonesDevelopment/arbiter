from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./arbiter.db"
    polymarket_gamma_url: str = "https://gamma-api.polymarket.com"
    kalshi_api_url: str = "https://api.elections.kalshi.com/trade-api/v2"
    collection_interval_minutes: int = 5
    min_edge_pct: float = 0.5
    min_certainty_pct: float = 95.0
    min_volume: float = 10000.0
    min_liquidity_per_leg: float = 500.0
    fee_rate: float = 0.02
    kalshi_profit_fee: float = 0.07
    tailing_min_price_move: float = 0.02
    max_practical_legs: int = 20
    frontend_url: str = "http://localhost:5173"


settings = Settings()
