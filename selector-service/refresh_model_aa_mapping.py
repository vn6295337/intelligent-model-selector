#!/usr/bin/env python3
"""
Auto-refresh ims.10_model_aa_mapping table
Triggered after working_version updates from pipeline

Flow:
1. Clear existing mappings
2. Fetch all provider_slug + inference_provider from working_version
3. Attempt to match with aa_slug from ims.20_aa_performance_metrics
4. Insert matched records into ims.10_model_aa_mapping
"""

import os
import sys
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values

# Database connection from environment
DATABASE_URL = os.environ.get('PIPELINE_SUPABASE_URL')

if not DATABASE_URL:
    print("ERROR: PIPELINE_SUPABASE_URL environment variable not set")
    sys.exit(1)

def get_db_connection():
    """Create database connection"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"ERROR: Failed to connect to database: {e}")
        sys.exit(1)

def clear_mapping_table(conn):
    """Clear all existing mappings"""
    try:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM ims."10_model_aa_mapping";')
            deleted_count = cur.rowcount
            conn.commit()
            print(f"✓ Cleared {deleted_count} existing mappings")
            return True
    except Exception as e:
        conn.rollback()
        print(f"ERROR: Failed to clear mappings: {e}")
        return False

def fetch_working_version_models(conn):
    """Fetch all models from working_version"""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT
                    inference_provider,
                    provider_slug
                FROM public.working_version
                WHERE provider_slug IS NOT NULL
                  AND provider_slug != ''
                ORDER BY inference_provider, provider_slug
            """)
            models = cur.fetchall()
            print(f"✓ Fetched {len(models)} models from working_version")
            return models
    except Exception as e:
        print(f"ERROR: Failed to fetch working_version models: {e}")
        return []

def fetch_aa_performance_slugs(conn):
    """Fetch all aa_slug values from performance metrics"""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT aa_slug
                FROM ims."20_aa_performance_metrics"
                ORDER BY aa_slug
            """)
            aa_slugs = [row[0] for row in cur.fetchall()]
            print(f"✓ Fetched {len(aa_slugs)} AA performance metric slugs")
            return aa_slugs
    except Exception as e:
        print(f"ERROR: Failed to fetch AA slugs: {e}")
        return []

def match_provider_slug_to_aa_slug(provider_slug, inference_provider, aa_slugs):
    """
    Attempt to match provider_slug to aa_slug

    Matching strategies:
    1. Exact match: provider_slug == aa_slug
    2. Suffix match: aa_slug ends with provider_slug
    3. Contains match: provider_slug in aa_slug
    """
    provider_slug_lower = provider_slug.lower()

    # Strategy 1: Exact match
    if provider_slug_lower in [slug.lower() for slug in aa_slugs]:
        return next(slug for slug in aa_slugs if slug.lower() == provider_slug_lower)

    # Strategy 2: Suffix match (e.g., "llama-3.1-8b-instant" matches "meta-llama-3.1-8b-instant")
    for aa_slug in aa_slugs:
        if aa_slug.lower().endswith(provider_slug_lower):
            return aa_slug

    # Strategy 3: Contains match (e.g., "gpt-4o" in "gpt-4o-2024-05-13")
    for aa_slug in aa_slugs:
        if provider_slug_lower in aa_slug.lower():
            return aa_slug

    return None

def create_mappings(conn, models, aa_slugs):
    """Create mappings between provider_slug and aa_slug"""
    mappings = []
    unmatched = []

    print("\n=== Matching provider_slug to aa_slug ===")

    for inference_provider, provider_slug in models:
        aa_slug = match_provider_slug_to_aa_slug(provider_slug, inference_provider, aa_slugs)

        if aa_slug:
            mappings.append((
                provider_slug,
                aa_slug,
                inference_provider,
                datetime.utcnow(),
                datetime.utcnow()
            ))
            print(f"✓ {inference_provider}:{provider_slug} → {aa_slug}")
        else:
            unmatched.append(f"{inference_provider}:{provider_slug}")

    print(f"\n=== Mapping Summary ===")
    print(f"Matched: {len(mappings)}/{len(models)} models")
    print(f"Unmatched: {len(unmatched)} models")

    if unmatched:
        print(f"\nUnmatched models (require manual mapping):")
        for model in unmatched[:10]:  # Show first 10
            print(f"  - {model}")
        if len(unmatched) > 10:
            print(f"  ... and {len(unmatched) - 10} more")

    return mappings

def insert_mappings(conn, mappings):
    """Insert mappings into ims."10_model_aa_mapping" """
    if not mappings:
        print("⚠️  No mappings to insert")
        return False

    try:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO ims."10_model_aa_mapping"
                (provider_slug, aa_slug, inference_provider, created_at, updated_at)
                VALUES %s
                """,
                mappings
            )
            conn.commit()
            print(f"✓ Inserted {len(mappings)} mappings into ims.10_model_aa_mapping")
            return True
    except Exception as e:
        conn.rollback()
        print(f"ERROR: Failed to insert mappings: {e}")
        return False

def main():
    """Main execution"""
    print("=" * 70)
    print("Auto-refresh ims.10_model_aa_mapping")
    print(f"Started: {datetime.now().isoformat()}")
    print("=" * 70)

    conn = get_db_connection()

    try:
        # Step 1: Clear existing mappings
        if not clear_mapping_table(conn):
            return False

        # Step 2: Fetch models from working_version
        models = fetch_working_version_models(conn)
        if not models:
            print("⚠️  No models found in working_version")
            return False

        # Step 3: Fetch AA performance slugs
        aa_slugs = fetch_aa_performance_slugs(conn)
        if not aa_slugs:
            print("⚠️  No AA performance slugs found")
            return False

        # Step 4: Create mappings
        mappings = create_mappings(conn, models, aa_slugs)

        # Step 5: Insert mappings
        if not insert_mappings(conn, mappings):
            return False

        print("\n" + "=" * 70)
        print("✅ Auto-refresh completed successfully")
        print(f"Completed: {datetime.now().isoformat()}")
        print("=" * 70)
        return True

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
