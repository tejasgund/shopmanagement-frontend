"""
Throwaway proof of the duplicate-rent-bill race.  python _race_demo.py

Reproduces what happened in production: two schedulers (one per uvicorn
worker) firing at the same instant, each on its own DB session. Each reads
"no rent bill for this month yet" before the other commits, so both insert.

Run against MySQL to also prove the GET_LOCK fix works. Against SQLite the
lock is a no-op (single process), so only the race itself is demonstrated.
"""

import os
import threading

os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/race_demo.db")

from datetime import date, datetime          # noqa: E402
from decimal import Decimal                  # noqa: E402

from db_config import Base, SessionLocal, engine   # noqa: E402
from create_tables import Bill, Shop, User, UserShop, hash_password  # noqa: E402
import app as A                              # noqa: E402


def seed():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    u = User(name="Tenant Six", mobile="9000000006",
             password_hash=hash_password("x"), role="tenant",
             is_active=True, auto_rent_bill_enabled=True, rent_bill_date=13)
    db.add(u)
    s = Shop(shop_number="S-10", status="occupied",
             shop_rent=Decimal("10000"), shop_deposit=Decimal("0"))
    db.add(s)
    db.commit()
    db.add(UserShop(user_id=u.id, shop_id=s.id))
    db.commit()
    db.close()


def run(fn, target, results, idx):
    db = SessionLocal()
    try:
        results[idx] = fn(db, target)
    except Exception as exc:                  # noqa: BLE001
        results[idx] = {"error": str(exc)}
    finally:
        db.close()


def race(fn, label):
    seed()
    target = date(2026, 8, 13)
    results = [None, None]
    # Two "workers" starting at the same moment, exactly like two schedulers.
    threads = [threading.Thread(target=run, args=(fn, target, results, i)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    db = SessionLocal()
    bills = db.query(Bill).filter(Bill.bill_type == "Rent").all()
    db.close()

    print(f"\n--- {label} ---")
    for i, r in enumerate(results):
        created = r.get("created") if isinstance(r, dict) else r
        print(f"  worker {i + 1}: created={created} "
              f"skipped_existing={r.get('skipped_existing') if isinstance(r, dict) else '?'}"
              f"{' LOCKED-OUT' if isinstance(r, dict) and r.get('skipped_locked') else ''}")
    print(f"  rent bills in DB: {len(bills)}  -> {'DUPLICATE BUG' if len(bills) > 1 else 'correct'}")
    return len(bills)


if __name__ == "__main__":
    print(f"engine: {engine.dialect.name}")
    unlocked = race(A.generate_rent_bills_for_date, "WITHOUT the lock (the old behaviour)")
    locked = race(A.generate_rent_bills_for_date_locked, "WITH the lock (the fix)")

    print("\n================================")
    print(f"unlocked -> {unlocked} bill(s)")
    print(f"locked   -> {locked} bill(s)")
    if engine.dialect.name != "mysql":
        print("\nNOTE: on SQLite the named lock is a no-op, so both runs behave the")
        print("same. Run this with DATABASE_URL pointed at MySQL to see the fix bite.")
