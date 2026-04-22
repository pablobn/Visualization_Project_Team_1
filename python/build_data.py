"""
build_data.py
=============

Reads the daily composting CSV and produces ``js/data.js`` for the dashboard.

Run from the project root:

    python3 python/build_data.py

The script:

* Loads ``python/data/combined_compost_measurements.csv``
* Emits **daily** arrays per compound (temperature/humidity/heating by zone)
  plus outdoor temperature and humidity.
* Emits real-time snapshot values used by the cards on the *Real-Time Data*
  tab (latest-month aggregates + the month before for phase detection).
* Writes the result to ``js/data.js`` as ``window.APP_DATA = {...};`` so the
  dashboard works from ``file://`` without a web server.

The dashboard JavaScript is CSV-agnostic: it consumes the JS object written
here. Re-run this script whenever the CSV changes.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import pandas as pd


# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
CSV_PATH = HERE / "data" / "combined_compost_measurements.csv"
OUT_PATH = PROJECT / "js" / "data.js"


# --------------------------------------------------------------------------
# Column mapping (CSV → dashboard keys)
# --------------------------------------------------------------------------
COL_MAP = {
    "compound1": {
        "heating_kwh": "Compost 1-Inside-Heating - kWh",
        "temp_top":    "Compost 1-Upper-Temperature",
        "temp_mid":    "Compost 1-Middle-Temperature",
        "temp_bot":    "Compost 1-Lower-Temperature",
        "hum_top":     "Compost 1-Upper-Moisture",
        "hum_mid":     "Compost 1-Middle-Moisture",
        "hum_bot":     "Compost 1-Lower-Moisture",
    },
    "compound2": {
        "heating_kwh": "Compost 2-Inside-Heating - kWh",
        "temp_top":    "Compost 2-Upper-Temperature",
        "temp_mid":    "Compost 2-Middle-Temperature",
        "temp_bot":    "Compost 2-Lower-Temperature",
        "hum_top":     "Compost 2-Upper-Moisture",
        "hum_mid":     "Compost 2-Middle-Moisture",
        "hum_bot":     "Compost 2-Lower-Moisture",
    },
    "outside": {
        "temperature": "Outside-Outside-Temperature",
        "humidity":    "Outside-Outside-Moisture",
    },
    "shelter": {
        # "Shed" is the post-translation name for Katos (shelter/canopy)
        "temperature": "Shed-Shed-Temperature",
        "humidity":    "Shed-Shed-Moisture",
    },
}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def clean_series(series: pd.Series) -> list:
    """Convert a pandas series to a list, turning NaN into ``None`` for JSON."""
    out = []
    for v in series:
        if v is None or (isinstance(v, float) and math.isnan(v)):
            out.append(None)
        else:
            # Round to 2 decimals for compactness (the dashboard doesn't need more)
            out.append(round(float(v), 2))
    return out


def latest_month_aggregate(df: pd.DataFrame, col: str, how: str = "mean"):
    """Aggregate the last ~30 days of a column. None if all-NaN."""
    tail = df.tail(30)[col].dropna()
    if tail.empty:
        return None
    if how == "sum":
        return round(float(tail.sum()), 2)
    return round(float(tail.mean()), 2)


def prev_month_mean(df: pd.DataFrame, col: str):
    """Mean of the 30 days BEFORE the latest 30-day window."""
    window = df.iloc[-60:-30][col].dropna()
    if window.empty:
        return None
    return round(float(window.mean()), 2)


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------
def build() -> dict:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

    df = pd.read_csv(CSV_PATH)
    df["Day"] = pd.to_datetime(df["Day"])
    df = df.sort_values("Day").reset_index(drop=True)

    labels = [d.strftime("%Y-%m-%d") for d in df["Day"]]

    # --- Analysis (daily arrays) ---
    def compound_block(key: str) -> dict:
        m = COL_MAP[key]
        return {
            "temperature": {
                "top":    clean_series(df[m["temp_top"]]),
                "middle": clean_series(df[m["temp_mid"]]),
                "bottom": clean_series(df[m["temp_bot"]]),
            },
            "humidity": {
                "top":    clean_series(df[m["hum_top"]]),
                "middle": clean_series(df[m["hum_mid"]]),
                "bottom": clean_series(df[m["hum_bot"]]),
            },
            "heating": clean_series(df[m["heating_kwh"]]),
        }

    analysis = {
        "labels": labels,
        "outdoor": {
            "temperature": clean_series(df[COL_MAP["outside"]["temperature"]]),
            "humidity":    clean_series(df[COL_MAP["outside"]["humidity"]]),
        },
        "compound1": compound_block("compound1"),
        "compound2": compound_block("compound2"),
    }

    # --- Real-time snapshot (last ~30 days aggregates) ---
    def compound_realtime(key: str, title: str) -> dict:
        m = COL_MAP[key]
        return {
            "title": title,
            "top": {
                "temperature": latest_month_aggregate(df, m["temp_top"], "mean"),
                "humidity":    latest_month_aggregate(df, m["hum_top"], "mean"),
            },
            "middle": {
                "temperature": latest_month_aggregate(df, m["temp_mid"], "mean"),
                "humidity":    latest_month_aggregate(df, m["hum_mid"], "mean"),
            },
            "bottom": {
                "temperature": latest_month_aggregate(df, m["temp_bot"], "mean"),
                "humidity":    latest_month_aggregate(df, m["hum_bot"], "mean"),
            },
            "heating":        latest_month_aggregate(df, m["heating_kwh"], "sum"),
            "prevMiddleTemp": prev_month_mean(df, m["temp_mid"]),
        }

    realtime = {
        "shelter": [
            {
                "name": "Shed",
                "temperature": latest_month_aggregate(df, COL_MAP["shelter"]["temperature"]),
                "humidity":    latest_month_aggregate(df, COL_MAP["shelter"]["humidity"]),
            }
        ],
        "compounds": [
            compound_realtime("compound1", "Compound 1"),
            compound_realtime("compound2", "Compound 2"),
        ],
        "outdoor": [
            {
                "name": "Outside",
                "temperature": latest_month_aggregate(df, COL_MAP["outside"]["temperature"]),
                "humidity":    latest_month_aggregate(df, COL_MAP["outside"]["humidity"]),
            }
        ],
    }

    meta = {
        "source_csv": CSV_PATH.name,
        "days": len(labels),
        "from": labels[0],
        "to": labels[-1],
    }

    return {"meta": meta, "realtime": realtime, "analysis": analysis}


def write(payload: dict) -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Emit as a JS file so file:// browsing works with no web server.
    body = json.dumps(payload, ensure_ascii=False)
    header = (
        "// AUTO-GENERATED by python/build_data.py — do not edit by hand.\n"
        f"// Source: {payload['meta']['source_csv']}\n"
        f"// Range:  {payload['meta']['from']} -> {payload['meta']['to']} "
        f"({payload['meta']['days']} days)\n\n"
        "window.APP_DATA = "
    )
    OUT_PATH.write_text(header + body + ";\n", encoding="utf-8")


if __name__ == "__main__":
    payload = build()
    write(payload)
    print(f"Wrote {OUT_PATH} "
          f"({payload['meta']['days']} days, "
          f"{payload['meta']['from']} → {payload['meta']['to']})")
