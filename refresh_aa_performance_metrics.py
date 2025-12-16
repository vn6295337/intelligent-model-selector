#!/usr/bin/env python3
"""
Refresh AA Performance Metrics Table (ims.20_aa_performance_metrics)

Fetches latest model performance data from Artificial Analysis API and
updates the ims.20_aa_performance_metrics table in Supabase.

This script runs daily via GitHub Actions at 00:00 UTC.
"""

import os
import sys
import requests
import psycopg2
from datetime import datetime
from typing import List, Dict, Optional

# API Configuration
AA_API_BASE_URL = "https://artificialanalysis.ai/api/v2"
AA_API_KEY = os.getenv("ARTIFICIALANALYSIS_API_KEY")
PIPELINE_SUPABASE_URL = os.getenv("PIPELINE_SUPABASE_URL")

def log(message: str):
    """Print timestamped log message"""
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{timestamp}] {message}")

def fetch_aa_performance_data() -> List[Dict]:
    """
    Fetch performance data from Artificial Analysis API

    Returns:
        List of model performance dictionaries
    """
    log("Fetching data from Artificial Analysis API...")

    if not AA_API_KEY or AA_API_KEY == "your-api-key-here":
        raise ValueError("ARTIFICIALANALYSIS_API_KEY not configured")

    url = f"{AA_API_BASE_URL}/data/llms/models"
    headers = {
        "x-api-key": AA_API_KEY,
        "Accept": "application/json"
    }

    response = requests.get(url, headers=headers, timeout=30)

    if not response.ok:
        raise Exception(f"API request failed: {response.status_code} - {response.text}")

    # Check rate limits
    rate_limit_remaining = response.headers.get("X-RateLimit-Remaining")
    if rate_limit_remaining:
        log(f"Rate limit: {rate_limit_remaining} requests remaining")

    data = response.json()

    if not data.get("data") or not isinstance(data["data"], list):
        raise Exception("Invalid API response format")

    log(f"Fetched {len(data['data'])} models from API")

    return data["data"]

def transform_to_db_format(api_data: List[Dict]) -> List[Dict]:
    """
    Transform API data to database schema format

    Args:
        api_data: Raw data from Artificial Analysis API

    Returns:
        List of dictionaries matching database schema
    """
    log("Transforming data to database format...")

    records = []

    for model in api_data:
        evaluations = model.get("evaluations", {})
        pricing = model.get("pricing", {})
        creator = model.get("model_creator", {})

        # Extract intelligence index (primary metric)
        intelligence_index = evaluations.get("artificial_analysis_intelligence_index")

        # Skip models without intelligence index
        if intelligence_index is None:
            continue

        record = {
            "aa_model_id": model.get("id"),
            "aa_slug": model.get("slug"),
            "name": model.get("name"),
            "creator_name": creator.get("name"),
            "creator_slug": creator.get("slug"),
            "release_date": model.get("release_date"),

            # Performance metrics
            "intelligence_index": intelligence_index,
            "coding_index": evaluations.get("artificial_analysis_coding_index"),
            "math_index": evaluations.get("artificial_analysis_math_index"),

            # Benchmarks
            "mmlu_pro": evaluations.get("mmlu_pro"),
            "gpqa": evaluations.get("gpqa"),
            "hle": evaluations.get("hle"),
            "livecodebench": evaluations.get("livecodebench"),
            "scicode": evaluations.get("scicode"),
            "math_500": evaluations.get("math_500"),
            "aime": evaluations.get("aime"),
            "aime_25": evaluations.get("aime_25"),
            "ifbench": evaluations.get("ifbench"),
            "lcr": evaluations.get("lcr"),
            "terminalbench_hard": evaluations.get("terminalbench_hard"),
            "tau2": evaluations.get("tau2"),

            # Pricing
            "price_1m_input_tokens": pricing.get("price_1m_input_tokens"),
            "price_1m_output_tokens": pricing.get("price_1m_output_tokens"),
            "price_1m_blended": pricing.get("price_1m_blended_3_to_1"),

            # Latency
            "median_output_tokens_per_second": model.get("median_output_tokens_per_second"),
            "median_time_to_first_token_seconds": model.get("median_time_to_first_token_seconds"),
            "median_time_to_first_answer_token": model.get("median_time_to_first_answer_token"),
        }

        records.append(record)

    log(f"Transformed {len(records)} records (filtered out {len(api_data) - len(records)} without intelligence index)")

    return records

def refresh_database_table(records: List[Dict]):
    """
    Refresh the ims.20_aa_performance_metrics table

    Strategy: BACKUP + DELETE + INSERT
    1. Create backup table
    2. Delete all existing records
    3. Insert new records
    4. Drop backup on success

    Args:
        records: List of dictionaries to insert
    """
    log("Connecting to Supabase PostgreSQL...")

    if not PIPELINE_SUPABASE_URL:
        raise ValueError("PIPELINE_SUPABASE_URL not configured")

    conn = psycopg2.connect(PIPELINE_SUPABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # Step 1: Create backup table
        log("Creating backup table...")
        cur.execute("""
            DROP TABLE IF EXISTS ims."20_aa_performance_metrics_backup";

            CREATE TABLE ims."20_aa_performance_metrics_backup" AS
            SELECT * FROM ims."20_aa_performance_metrics";
        """)

        backup_count = cur.rowcount
        log(f"Backed up {backup_count} existing records")

        # Step 2: Delete all existing records
        log("Deleting existing records...")
        cur.execute('DELETE FROM ims."20_aa_performance_metrics";')
        deleted_count = cur.rowcount
        log(f"Deleted {deleted_count} records")

        # Step 3: Insert new records
        log(f"Inserting {len(records)} new records...")

        insert_sql = """
            INSERT INTO ims."20_aa_performance_metrics" (
                aa_model_id, aa_slug, name, creator_name, creator_slug, release_date,
                intelligence_index, coding_index, math_index,
                mmlu_pro, gpqa, hle, livecodebench, scicode, math_500, aime, aime_25,
                ifbench, lcr, terminalbench_hard, tau2,
                price_1m_input_tokens, price_1m_output_tokens, price_1m_blended,
                median_output_tokens_per_second, median_time_to_first_token_seconds,
                median_time_to_first_answer_token
            ) VALUES (
                %(aa_model_id)s, %(aa_slug)s, %(name)s, %(creator_name)s, %(creator_slug)s,
                %(release_date)s, %(intelligence_index)s, %(coding_index)s, %(math_index)s,
                %(mmlu_pro)s, %(gpqa)s, %(hle)s, %(livecodebench)s, %(scicode)s,
                %(math_500)s, %(aime)s, %(aime_25)s, %(ifbench)s, %(lcr)s,
                %(terminalbench_hard)s, %(tau2)s, %(price_1m_input_tokens)s,
                %(price_1m_output_tokens)s, %(price_1m_blended)s,
                %(median_output_tokens_per_second)s, %(median_time_to_first_token_seconds)s,
                %(median_time_to_first_answer_token)s
            )
        """

        cur.executemany(insert_sql, records)
        inserted_count = cur.rowcount
        log(f"Inserted {inserted_count} records")

        # Step 4: Commit and drop backup
        conn.commit()
        log("Transaction committed successfully")

        cur.execute('DROP TABLE IF EXISTS ims."20_aa_performance_metrics_backup";')
        conn.commit()
        log("Backup table dropped")

        log("✅ Refresh completed successfully")

    except Exception as e:
        log(f"❌ Error during refresh: {e}")
        log("Rolling back transaction...")
        conn.rollback()

        # Restore from backup if available
        try:
            log("Attempting to restore from backup...")
            cur.execute("""
                DELETE FROM ims."20_aa_performance_metrics";
                INSERT INTO ims."20_aa_performance_metrics"
                SELECT * FROM ims."20_aa_performance_metrics_backup";
            """)
            conn.commit()
            log("Restored from backup successfully")
        except Exception as restore_error:
            log(f"Failed to restore from backup: {restore_error}")

        raise

    finally:
        cur.close()
        conn.close()
        log("Database connection closed")

def main():
    """Main execution flow"""
    try:
        log("=" * 80)
        log("AA PERFORMANCE METRICS REFRESH - STARTING")
        log("=" * 80)

        # Step 1: Fetch data from API
        api_data = fetch_aa_performance_data()

        # Step 2: Transform to database format
        db_records = transform_to_db_format(api_data)

        if not db_records:
            log("⚠️  No records to insert (all models missing intelligence index)")
            return

        # Step 3: Refresh database table
        refresh_database_table(db_records)

        log("=" * 80)
        log("✅ REFRESH COMPLETED SUCCESSFULLY")
        log(f"   Total models processed: {len(api_data)}")
        log(f"   Records inserted: {len(db_records)}")
        log("=" * 80)

    except Exception as e:
        log("=" * 80)
        log(f"❌ REFRESH FAILED: {e}")
        log("=" * 80)
        sys.exit(1)

if __name__ == "__main__":
    main()
