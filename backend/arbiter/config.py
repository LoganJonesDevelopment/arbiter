from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./arbiter.db"
    polymarket_gamma_url: str = "https://gamma-api.polymarket.com"
    polymarket_clob_url: str = "https://clob.polymarket.com"
    collection_interval_minutes: int = 5
    min_edge_pct: float = 0.5
    min_certainty_pct: float = 95.0
    min_volume: float = 10000.0
    min_liquidity_per_leg: float = 500.0
    fee_rate: float = 0.02
    tailing_min_price_move: float = 0.02
    max_practical_legs: int = 20
    frontend_url: str = "http://localhost:5173"


settings = Settings()
