-- Fix duplicate games by creating new table with proper constraints

-- 1. Create new games table with unique constraint
CREATE TABLE games_new (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    game_id varchar(255) NOT NULL UNIQUE,  -- This prevents duplicates!
    sport varchar(100) NOT NULL,
    league varchar(100),
    bet_type varchar(100),
    market_info varchar(255),
    home_team varchar(255) NOT NULL,
    away_team varchar(255) NOT NULL,
    home_rotation varchar(50),
    away_rotation varchar(50),
    start_time varchar(100),
    start_time_parsed timestamp with time zone,
    game_status varchar(50),
    inning_info varchar(50),
    game_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name varchar(511),
    sport_display varchar(100),
    league_display varchar(100)
);

-- 2. Insert unique games only (keeping most recent version)
INSERT INTO games_new (
    game_id, sport, league, bet_type, market_info, home_team, away_team,
    home_rotation, away_rotation, start_time, start_time_parsed, game_status,
    inning_info, game_url, created_at, updated_at, name, sport_display, league_display
)
SELECT DISTINCT ON (game_id)
    game_id, sport, league, bet_type, market_info, home_team, away_team,
    home_rotation, away_rotation, start_time, start_time_parsed, game_status,
    inning_info, game_url, created_at, updated_at, name, sport_display, league_display
FROM games
ORDER BY game_id, created_at DESC;

-- 3. Create indexes on new table
CREATE INDEX idx_games_new_game_id ON games_new (game_id);
CREATE INDEX idx_games_new_sport_league ON games_new (sport, league);
CREATE INDEX idx_games_new_start_time ON games_new (start_time);

-- 4. Drop old table and rename new one
DROP TABLE games CASCADE;
ALTER TABLE games_new RENAME TO games;

-- 5. Update the odds table foreign key constraint
ALTER TABLE odds ADD CONSTRAINT odds_game_table_id_fkey 
FOREIGN KEY (game_table_id) REFERENCES games(id);

-- 6. Add RLS policies back
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Allow anon read access
CREATE POLICY "Allow anon read access" ON games
FOR SELECT TO anon USING (true);

-- Enable all for anon
CREATE POLICY "Enable all for anon" ON games  
TO anon USING (true) WITH CHECK (true);

-- Enable all for authenticated  
CREATE POLICY "Enable all for authenticated" ON games
TO authenticated USING (true) WITH CHECK (true);

-- Enable all for service_role
CREATE POLICY "Enable all for service_role" ON games
TO service_role USING (true) WITH CHECK (true);

-- 7. Add update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;   
END;
$$ language 'plpgsql';

CREATE TRIGGER update_games_updated_at 
BEFORE UPDATE ON games 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();