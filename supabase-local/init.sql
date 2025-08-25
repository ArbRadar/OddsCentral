-- Create games table
CREATE TABLE IF NOT EXISTS games (
  id BIGSERIAL PRIMARY KEY,
  game_id VARCHAR(255) UNIQUE NOT NULL,
  sport VARCHAR(100) NOT NULL,
  league VARCHAR(100),
  bet_type VARCHAR(100), -- e.g., 'Moneyline', 'Spread', 'Total'
  market_info VARCHAR(255), -- Additional market context
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  home_rotation VARCHAR(50),
  away_rotation VARCHAR(50),
  start_time VARCHAR(100),
  start_time_parsed TIMESTAMPTZ, -- Parsed datetime when available
  game_status VARCHAR(50), -- e.g., 'scheduled', 'live', 'final'
  inning_info VARCHAR(50), -- For live games: '7 Top', '3 Bottom', etc.
  game_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name VARCHAR(511), -- "TeamA vs TeamB" format
  sport_display VARCHAR(100), -- "Baseball", "Football", etc.
  league_display VARCHAR(100) -- "MLB", "NFL", etc.
);

-- Create odds table
CREATE TABLE IF NOT EXISTS odds (
  id BIGSERIAL PRIMARY KEY,
  game_id VARCHAR(255) NOT NULL REFERENCES games(game_id),
  sportsbook VARCHAR(100) NOT NULL,
  home_odds INTEGER,
  away_odds INTEGER,
  draw_odds INTEGER, -- For 3-way markets like soccer
  home_odds_percent DECIMAL(5,2),
  away_odds_percent DECIMAL(5,2),
  draw_odds_percent DECIMAL(5,2), -- For 3-way markets like soccer
  odds_format VARCHAR(20), -- 'american', 'percentage', 'decimal', etc.
  best_home_odds INTEGER, -- Best available odds for home team at time of scraping
  best_away_odds INTEGER, -- Best available odds for away team at time of scraping
  best_draw_odds INTEGER, -- Best available draw odds for 3-way markets
  avg_home_odds INTEGER, -- Average odds for home team at time of scraping
  avg_away_odds INTEGER, -- Average odds for away team at time of scraping
  avg_draw_odds INTEGER, -- Average draw odds for 3-way markets
  timestamp TIMESTAMPTZ NOT NULL,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, sportsbook)
);

-- Create odds history table for tracking changes
CREATE TABLE IF NOT EXISTS odds_history (
  id BIGSERIAL PRIMARY KEY,
  game_id VARCHAR(255) NOT NULL,
  sportsbook VARCHAR(100) NOT NULL,
  home_odds INTEGER,
  away_odds INTEGER,
  draw_odds INTEGER, -- For 3-way markets like soccer
  home_odds_percent DECIMAL(5,2),
  away_odds_percent DECIMAL(5,2),
  draw_odds_percent DECIMAL(5,2), -- For 3-way markets like soccer
  previous_home_odds INTEGER,
  previous_away_odds INTEGER,
  previous_draw_odds INTEGER, -- Previous draw odds for 3-way markets
  previous_home_odds_percent DECIMAL(5,2),
  previous_away_odds_percent DECIMAL(5,2),
  previous_draw_odds_percent DECIMAL(5,2), -- Previous draw odds percentage
  odds_format VARCHAR(20),
  best_home_odds INTEGER, -- Best available odds for home team at time of scraping
  best_away_odds INTEGER, -- Best available odds for away team at time of scraping
  best_draw_odds INTEGER, -- Best available draw odds for 3-way markets
  avg_home_odds INTEGER, -- Average odds for home team at time of scraping
  avg_away_odds INTEGER, -- Average odds for away team at time of scraping
  avg_draw_odds INTEGER, -- Average draw odds for 3-way markets
  timestamp TIMESTAMPTZ NOT NULL,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_games_game_id ON games(game_id);
CREATE INDEX idx_games_sport_league ON games(sport, league);
CREATE INDEX idx_games_start_time ON games(start_time);

CREATE INDEX idx_odds_game_id ON odds(game_id);
CREATE INDEX idx_odds_sportsbook ON odds(sportsbook);
CREATE INDEX idx_odds_timestamp ON odds(timestamp);

CREATE INDEX idx_odds_history_game_id ON odds_history(game_id);
CREATE INDEX idx_odds_history_timestamp ON odds_history(timestamp);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create PostgREST roles
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;  
CREATE ROLE service_role NOLOGIN;

-- Grant the roles to postgres so PostgREST can switch to them
GRANT anon TO postgres;
GRANT authenticated TO postgres;
GRANT service_role TO postgres;

-- Grant schema access to PostgREST roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Enable Row Level Security (RLS)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds_history ENABLE ROW LEVEL SECURITY;

-- Create policies for PostgREST roles
CREATE POLICY "Enable all for anon" ON games
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated" ON games
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service_role" ON games
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for anon" ON odds
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated" ON odds
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service_role" ON odds
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for anon" ON odds_history
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated" ON odds_history
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service_role" ON odds_history
    FOR ALL TO service_role USING (true) WITH CHECK (true);