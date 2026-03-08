from datetime import datetime, UTC
from sqlalchemy import String, Float, Integer, DateTime, JSON, Boolean, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str | None] = mapped_column(String)
    category: Mapped[str | None] = mapped_column(String)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    neg_risk: Mapped[bool] = mapped_column(Boolean, default=False)
    markets_count: Mapped[int] = mapped_column(Integer, default=0)
    first_seen: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    markets: Mapped[list["Market"]] = relationship(back_populates="event")


class Market(Base):
    __tablename__ = "markets"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_id: Mapped[str] = mapped_column(String, ForeignKey("events.id"))
    question: Mapped[str | None] = mapped_column(String)
    condition_id: Mapped[str | None] = mapped_column(String)
    clob_token_ids: Mapped[list | None] = mapped_column(JSON)
    outcomes: Mapped[list | None] = mapped_column(JSON)
    outcome_prices: Mapped[list | None] = mapped_column(JSON)
    volume: Mapped[float] = mapped_column(Float, default=0)
    liquidity: Mapped[float] = mapped_column(Float, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    first_seen: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))

    event: Mapped["Event"] = relationship(back_populates="markets")


class Snapshot(Base):
    __tablename__ = "snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    market_id: Mapped[str] = mapped_column(String, ForeignKey("markets.id"), index=True)
    yes_price: Mapped[float | None] = mapped_column(Float)
    no_price: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)
    liquidity: Mapped[float | None] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), index=True)


class Opportunity(Base):
    __tablename__ = "opportunities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    opp_key: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String, index=True)
    event_id: Mapped[str] = mapped_column(String, ForeignKey("events.id"))
    edge_pct: Mapped[float] = mapped_column(Float)
    details: Mapped[dict] = mapped_column(JSON)
    markets_involved: Mapped[list] = mapped_column(JSON)
    first_seen: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    status: Mapped[str] = mapped_column(String, default="active", index=True)
