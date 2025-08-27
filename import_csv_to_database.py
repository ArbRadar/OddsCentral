#!/usr/bin/env python3
"""
Import CSV Data to Database
Purpose: Load CSV reference files into Supabase database tables for fast lookups
"""
import pandas as pd
import psycopg2
import os
from datetime import datetime

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

CSV_PATH = "/Users/joelsalazar/OddsCentral/docs/csv"

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD
    )

def create_reference_tables():
    """Create reference tables for fast lookups"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Sports reference table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sports_reference (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE,
                deleted_at TIMESTAMP WITH TIME ZONE
            );
        """)
        
        # Leagues reference table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS leagues_reference (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                sport_id UUID REFERENCES sports_reference(id),
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE,
                deleted_at TIMESTAMP WITH TIME ZONE,
                UNIQUE(name, sport_id)
            );
        """)
        
        # Teams reference table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS teams_reference (
                id UUID PRIMARY KEY,
                official_name VARCHAR(255) NOT NULL,
                sport_id UUID REFERENCES sports_reference(id),
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE,
                deleted_at TIMESTAMP WITH TIME ZONE,
                UNIQUE(official_name, sport_id)
            );
        """)
        
        # Countries reference table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS countries_reference (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                code VARCHAR(10),
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE,
                deleted_at TIMESTAMP WITH TIME ZONE
            );
        """)
        
        # Bookmakers reference table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS bookmakers_reference (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE,
                deleted_at TIMESTAMP WITH TIME ZONE
            );
        """)
        
        conn.commit()
        print("✅ Created reference tables")
        
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

def import_csv_data():
    """Import all CSV files into database tables"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    csv_mappings = {
        'sports_rows.csv': ('sports_reference', ['id', 'name', 'created_at', 'updated_at', 'deleted_at', 'active']),
        'leagues_rows.csv': ('leagues_reference', ['id', 'name', 'sport_id', 'created_at', 'updated_at', 'deleted_at', 'active']),
        'teams_rows.csv': ('teams_reference', ['id', 'official_name', 'sport_id', 'created_at', 'updated_at', 'deleted_at', 'active']),
        'countries_rows.csv': ('countries_reference', ['id', 'name', 'code', 'created_at', 'updated_at', 'deleted_at', 'active']),
        'bookmakers_rows (1).csv': ('bookmakers_reference', ['id', 'name', 'created_at', 'updated_at', 'deleted_at', 'active'])
    }
    
    total_imported = 0
    
    for filename, (table_name, columns) in csv_mappings.items():
        filepath = os.path.join(CSV_PATH, filename)
        
        if not os.path.exists(filepath):
            print(f"⚠️ File not found: {filename}")
            continue
            
        try:
            print(f"📥 Importing {filename} into {table_name}...")
            
            # Clear existing data
            cur.execute(f"DELETE FROM {table_name}")
            
            # Load CSV
            df = pd.read_csv(filepath)
            
            # Handle missing columns gracefully
            available_columns = [col for col in columns if col in df.columns]
            if len(available_columns) != len(columns):
                missing = set(columns) - set(available_columns)
                print(f"   ⚠️ Missing columns: {missing}")
            
            # Filter to only active records
            if 'active' in df.columns:
                df_active = df[df['active'] == True]
            else:
                df_active = df
            
            # Insert data
            records_imported = 0
            for _, row in df_active.iterrows():
                try:
                    # Prepare values for available columns
                    values = []
                    placeholders = []
                    
                    for col in available_columns:
                        value = row[col]
                        if pd.isna(value):
                            value = None
                        values.append(value)
                        placeholders.append("%s")
                    
                    # Build INSERT statement
                    columns_str = ", ".join(available_columns)
                    placeholders_str = ", ".join(placeholders)
                    
                    cur.execute(f"""
                        INSERT INTO {table_name} ({columns_str})
                        VALUES ({placeholders_str})
                        ON CONFLICT DO NOTHING
                    """, values)
                    
                    records_imported += 1
                    
                except Exception as e:
                    print(f"     ❌ Error inserting row: {e}")
                    continue
            
            conn.commit()
            total_imported += records_imported
            print(f"   ✅ Imported {records_imported} records")
            
        except Exception as e:
            print(f"   ❌ Error importing {filename}: {e}")
            conn.rollback()
            continue
    
    cur.close()
    conn.close()
    
    print(f"\n✅ Total imported: {total_imported} records")
    return total_imported

def create_indexes():
    """Create indexes for fast lookups and fuzzy matching"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        print("🔍 Creating database indexes...")
        
        # Create trigram extension if not exists
        cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        
        # Sports indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_sports_name_lower ON sports_reference USING GIN (LOWER(name) gin_trgm_ops)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_sports_active ON sports_reference (active)")
        
        # Leagues indexes  
        cur.execute("CREATE INDEX IF NOT EXISTS idx_leagues_name_lower ON leagues_reference USING GIN (LOWER(name) gin_trgm_ops)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_leagues_sport_active ON leagues_reference (sport_id, active)")
        
        # Teams indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_teams_name_lower ON teams_reference USING GIN (LOWER(official_name) gin_trgm_ops)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_teams_sport_active ON teams_reference (sport_id, active)")
        
        # Countries indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_countries_name_lower ON countries_reference USING GIN (LOWER(name) gin_trgm_ops)")
        
        # Bookmakers indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_bookmakers_name_lower ON bookmakers_reference USING GIN (LOWER(name) gin_trgm_ops)")
        
        conn.commit()
        print("✅ Created database indexes")
        
    except Exception as e:
        print(f"❌ Error creating indexes: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()

def verify_import():
    """Verify the imported data"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        tables = ['sports_reference', 'leagues_reference', 'teams_reference', 'countries_reference', 'bookmakers_reference']
        
        print("\n📊 Imported data summary:")
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {table} WHERE active = true")
            count = cur.fetchone()[0]
            print(f"  {table}: {count:,} active records")
        
        # Test fuzzy matching capability
        print("\n🔍 Testing fuzzy matching:")
        
        # Test sport matching
        cur.execute("""
            SELECT name, SIMILARITY(LOWER(name), 'baseball') as sim
            FROM sports_reference 
            WHERE active = true AND SIMILARITY(LOWER(name), 'baseball') > 0.3
            ORDER BY sim DESC LIMIT 3
        """)
        
        results = cur.fetchall()
        print("  Baseball matches:")
        for name, sim in results:
            print(f"    {name} (similarity: {sim:.2f})")
        
        # Test team matching
        cur.execute("""
            SELECT official_name, SIMILARITY(LOWER(official_name), 'yankees') as sim
            FROM teams_reference 
            WHERE active = true AND SIMILARITY(LOWER(official_name), 'yankees') > 0.3
            ORDER BY sim DESC LIMIT 3
        """)
        
        results = cur.fetchall()
        print("  Yankees matches:")
        for name, sim in results:
            print(f"    {name} (similarity: {sim:.2f})")
        
    except Exception as e:
        print(f"❌ Error verifying import: {e}")
    finally:
        cur.close()
        conn.close()

def main():
    print("🚀 Importing CSV Data to Database")
    print("=" * 50)
    
    # 1. Create reference tables
    create_reference_tables()
    
    # 2. Import CSV data
    total_records = import_csv_data()
    
    if total_records > 0:
        # 3. Create indexes for performance
        create_indexes()
        
        # 4. Verify import
        verify_import()
        
        print("\n✅ Database import completed successfully!")
        print("📈 Ready for high-performance matching engine")
    else:
        print("\n❌ No data imported. Please check CSV files.")

if __name__ == "__main__":
    main()